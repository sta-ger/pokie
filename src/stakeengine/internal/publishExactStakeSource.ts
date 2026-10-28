import {StakeEngineRoundEventsImporter} from "../StakeEngineRoundEventsImporter.js";
import type {StakeEngineBookLine} from "../StakeEngineBookLine.js";
import crypto from "crypto";
import {StakeEngineImportValidator} from "../StakeEngineImportValidator.js";
import fs from "fs";
import path from "path";
import type {StakeEngineExactSource} from "../StakeEngineExactSource.js";
import {StakeEngineExportCancelledError, type StakeEngineExportOptions} from "../StakeEngineExporting.js";
import type {StakeEngineExportResult} from "../StakeEngineExportResult.js";
import type {StakeEngineManifest} from "../StakeEngineManifest.js";
import {StakeEngineStandaloneValidator} from "../standalone/StakeEngineStandaloneValidator.js";
import type {StakeEngineStandaloneFileResult, StakeEngineStandaloneBookLineResult, StakeEngineStandaloneBundle} from "../standalone/StakeEngineStandaloneBundle.js";
import {decompressZstdSync} from "./zstd.js";
import {capturePublishDirectoryOwnership, publishDirectoryAtomically, removePublishedDirectoryIfOwned, withPublishedDirectoryOwnership} from "./publishDirectoryAtomically.js";
import {assertArtifactDestinationAvailable} from "../../project/internal/assertArtifactDestinationAvailable.js";

/** Validate the captured bytes rather than rereading mutable source paths at publication. */
export function validateExactStakeSource(source: StakeEngineExactSource): void {
    for (const name of Object.keys(source.files)) {
        if (!(/^[A-Za-z0-9_.-]+$/).test(name) || name === "." || name === "..") throw new Error(`Unsafe Stake payload filename: ${name}`);
    }
    const index = JSON.parse(Buffer.from(source.files["index.json"] ?? "", "base64").toString("utf8")) as {modes: {name: string; cost: number; events: string; weights: string}[]};
    const file = <T>(name: string, parse: (bytes: Buffer) => T): StakeEngineStandaloneFileResult<T> => {
        if (source.files[name] === undefined) return {status: "missing"};
        try {
            return {status: "ok", value: parse(Buffer.from(source.files[name], "base64"))};
        } catch (error) {
            return {status: "invalid", error: String(error)};
        }
    };
    const bundle: StakeEngineStandaloneBundle = {
        stakeDir: "captured Stake payload",
        index: {status: "ok", value: index},
        modeFiles: Array.isArray(index.modes) ? index.modes.map(mode => ({
            modeName: mode.name, cost: mode.cost,
            csv: file(mode.weights, bytes => bytes.toString("utf8").split("\n").filter(Boolean)),
            books: file(mode.events, bytes => decompressZstdSync(bytes).toString("utf8").split("\n").filter(Boolean).map((line): StakeEngineStandaloneBookLineResult => {
                try {
                    return {status: "ok", value: JSON.parse(line)};
                } catch (error) {
                    return {status: "invalid", error: String(error)};
                }
            })),
        })) : [],
    };
    const issues = new StakeEngineStandaloneValidator().validate(bundle);
    if (source.files["pokie-manifest.json"] !== undefined) {
        const manifestFile = file("pokie-manifest.json", bytes => JSON.parse(bytes.toString("utf8")));
        issues.push(...new StakeEngineImportValidator().validate({...bundle, manifest: manifestFile}));
        if (!issues.some(issue => issue.severity === "error") && manifestFile.status === "ok") {
            const manifest = manifestFile.value as StakeEngineManifest;
            const importer = new StakeEngineRoundEventsImporter();
            for (const mode of bundle.modeFiles) {
                const metadata = manifest.modes.find(entry => entry.name === mode.modeName)!;
                if (mode.books.status !== "ok") continue;
                for (const parsed of mode.books.value) {
                    if (parsed.status !== "ok") continue;
                    const book = parsed.value as StakeEngineBookLine;
                    const finalWin = book.events[book.events.length - 1];
                    if (finalWin?.payoutMultiplier !== book.payoutMultiplier) throw new Error(`mode ${mode.modeName}: book payoutMultiplier differs from finalWin.payoutMultiplier.`);
                    importer.importEvents(book.events, {cost: mode.cost, stake: metadata.stake});
                }
            }
        }
    } else {
        const encoded = source.files["pokie-native-weights.json"];
        if (encoded === undefined) throw new Error("Exact Stake interchange requires POKIE export or native optimizer provenance.");
        const manifest = JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as {version?: string; files?: Record<string, string>};
        const inventory = Object.fromEntries(Object.entries(source.files).filter(([name]) => name !== "pokie-native-weights.json").map(([name, value]) => [name, `sha256:${crypto.createHash("sha256").update(Buffer.from(value, "base64")).digest("hex")}`]));
        if (manifest.version !== "pokie.native-weights.v1" || !manifest.files || JSON.stringify(Object.entries(inventory).sort()) !== JSON.stringify(Object.entries(manifest.files).sort())) throw new Error("Native Stake captured inventory differs from its optimizer provenance.");
    }
    const errors = issues.filter(issue => issue.severity === "error");
    if (errors.length) throw new Error(errors.map(issue => `${issue.code}: ${issue.message}`).join("; "));
}

/** New/empty publication only. Snapshot ownership and the shared atomic commit protect late claimants. */
export function publishExactStakeSource(source: StakeEngineExactSource, outDir: string, options?: StakeEngineExportOptions): StakeEngineExportResult {
    source = {files: {...source.files}};
    const cancelled = (): void => {
        if (options?.signal?.aborted) throw new StakeEngineExportCancelledError();
    };
    cancelled();
    validateExactStakeSource(source);
    assertArtifactDestinationAvailable(outDir, "directory");
    const ownership = options?.destinationOwnership ?? capturePublishDirectoryOwnership(outDir);
    const files = Object.keys(source.files);
    const manifest = source.files["pokie-manifest.json"] === undefined ? undefined : JSON.parse(Buffer.from(source.files["pokie-manifest.json"], "base64").toString("utf8")) as StakeEngineManifest;
    const {publication} = publishDirectoryAtomically({
        outDir, ownership,
        beforeCommit: cancelled,
        writeFilesIntoTempDir: directory => {
            let completed = BigInt(0);
            for (const name of files) {
                cancelled();
                fs.writeFileSync(path.join(directory, name), Buffer.from(source.files[name], "base64"));
                options?.onProgress?.({phase: "Publishing exact Stake files", unit: "files", completed: ++completed, total: BigInt(files.length), message: `Publishing exact Stake file ${name}`});
                cancelled();
            }
        },
    });
    try {
        cancelled();
    } catch (error) {
        removePublishedDirectoryIfOwned(publication);
        throw error;
    }
    return withPublishedDirectoryOwnership({outDir, files, manifest, issues: []}, publication);
}
