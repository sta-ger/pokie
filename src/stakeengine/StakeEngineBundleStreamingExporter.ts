import crypto from "crypto";
import {once} from "events";
import fs from "fs";
import path from "path";
import {finished} from "stream/promises";
import zlib from "zlib";
import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import {assertSafeToReplaceStakeEngineExportDirectory} from "./internal/assertSafeToReplaceStakeEngineExportDirectory.js";
import {convertRatioToStakeUnits} from "./internal/convertRatioToStakeUnits.js";
import {parseStakeEngineOutcomeId} from "./internal/parseStakeEngineOutcomeId.js";
import {publishDirectoryAtomically} from "./internal/publishDirectoryAtomically.js";
import type {StakeEngineBookLine} from "./StakeEngineBookLine.js";
import type {StakeEngineBundleModeInput} from "./StakeEngineBundleModeInput.js";
import type {StakeEngineEvent} from "./StakeEngineEvent.js";
import type {StakeEngineExportResult} from "./StakeEngineExportResult.js";
import type {StakeEngineIndex} from "./StakeEngineIndex.js";
import {STAKE_ENGINE_MANIFEST_SCHEMA_VERSION, type StakeEngineManifest, type StakeEngineManifestModeEntry} from "./StakeEngineManifest.js";
import type {StakeEngineBundleStreamingExporting} from "./StakeEngineBundleStreamingExporting.js";
import {StakeEngineRoundEventsProjector} from "./StakeEngineRoundEventsProjector.js";
import type {StakeEngineRoundEventsProjecting} from "./StakeEngineRoundEventsProjecting.js";

const GENERATED_BY = "pokie stakeengine export";

type ModeProvenanceKey = {
    readonly gameId: unknown;
    readonly gameVersion: unknown;
    readonly configHash: unknown;
    readonly pokieVersion: unknown;
};

type BuiltMode = {
    readonly manifestEntry: StakeEngineManifestModeEntry;
    readonly provenance: {readonly game: StakeEngineManifest["game"]; readonly configHash?: string; readonly pokieVersion: string};
};

// Exports one or more Stake modes directly from a canonical outcome-library bundle (see
// docs/outcome-library-bundle.md), streaming each mode's outcomes straight from the bundle's own
// iterateModeOutcomes into Stake's CSV/books.jsonl.zst output — never materializing a WeightedOutcomeLibrary
// (readLibrary() is never called), and never buffering a whole mode's CSV/books content in memory the way
// StakeEngineExporter's own array-based buildMode does (the books file is streamed through Node's native
// zstd Transform stream, zlib.createZstdCompress, one book line at a time). A mode's libraryHash/libraryId/
// outcomeCount are read directly from the bundle's own small index — already computed when the bundle was
// built, never recomputed here (the same "no second calculation path" discipline as everywhere else in this
// codebase).
//
// Deliberately a separate class from StakeEngineExporter, not a variant grafted onto it: StakeEngineExporter's
// own array-based "every mode's library fully in memory" contract and its atomic-publish internals are already
// stabilized across several prior passes, and this class exists specifically to support a genuinely different
// input shape (a bundle reference, not a WeightedOutcomeLibrary) without touching that file. It still produces
// byte-for-byte the same Stake output shape (index.json, lookup_<mode>.csv, books_<mode>.jsonl.zst, pokie-
// manifest.json) and reuses the same shared internals (assertSafeToReplaceStakeEngineExportDirectory,
// publishDirectoryAtomically, convertRatioToStakeUnits, parseStakeEngineOutcomeId, StakeEngineRoundEventsProjector)
// so the two exporters can never silently disagree about what "the same mode, exported" looks like.
//
// Atomicity mirrors OutcomeLibraryBundleWriter's own approach for the same reason: publishDirectoryAtomically's
// writeFilesIntoTempDir callback must be synchronous, but streaming a mode's outcomes is inherently async, so
// this class writes into its own staging directory first, then publishes by synchronously renaming each
// already-written file into publishDirectoryAtomically's own temp dir.
export class StakeEngineBundleStreamingExporter<T extends string | number = string> implements StakeEngineBundleStreamingExporting {
    private readonly pokieVersion: string;
    private readonly eventsProjector: StakeEngineRoundEventsProjecting<T>;
    private readonly reader: OutcomeLibraryBundleReading<T>;
    private readonly now: () => Date;
    private readonly renameDirectory: (from: string, to: string) => void;
    private readonly removeDirectory: (dirPath: string) => void;

    constructor(
        pokieVersion: string,
        eventsProjector: StakeEngineRoundEventsProjecting<T> = new StakeEngineRoundEventsProjector<T>(),
        reader: OutcomeLibraryBundleReading<T> = new OutcomeLibraryBundleReader<T>(),
        now: () => Date = () => new Date(),
        renameDirectory: (from: string, to: string) => void = (from, to) => fs.renameSync(from, to),
        removeDirectory: (dirPath: string) => void = (dirPath) => fs.rmSync(dirPath, {recursive: true, force: true}),
    ) {
        this.pokieVersion = pokieVersion;
        this.eventsProjector = eventsProjector;
        this.reader = reader;
        this.now = now;
        this.renameDirectory = renameDirectory;
        this.removeDirectory = removeDirectory;
    }

    public async exportToDirectory(modes: readonly StakeEngineBundleModeInput[], outDir: string): Promise<StakeEngineExportResult> {
        const upfrontIssues = this.validateUpfront(modes);
        if (upfrontIssues.some((issue) => issue.severity === "error")) {
            return {outDir, files: [], manifest: undefined, issues: upfrontIssues};
        }

        const stagingDir = `${outDir}.staging-${crypto.randomBytes(6).toString("hex")}`;
        fs.mkdirSync(stagingDir, {recursive: true});
        try {
            const issues: ValidationIssue[] = [...upfrontIssues];
            const manifestEntries: StakeEngineManifestModeEntry[] = [];
            let reference: ModeProvenanceKey | undefined;
            let gameManifest: StakeEngineManifest["game"] | undefined;
            let configHash: string | undefined;

            for (const mode of modes) {
                const built = await this.buildMode(mode, stagingDir, issues);
                if (built === undefined) {
                    continue;
                }
                manifestEntries.push(built.manifestEntry);

                const current: ModeProvenanceKey = {
                    gameId: built.provenance.game.id,
                    gameVersion: built.provenance.game.version,
                    configHash: built.provenance.configHash,
                    pokieVersion: built.provenance.pokieVersion,
                };
                if (reference === undefined) {
                    reference = current;
                    gameManifest = built.provenance.game;
                    configHash = built.provenance.configHash;
                } else if (
                    current.gameId !== reference.gameId ||
                    current.gameVersion !== reference.gameVersion ||
                    current.configHash !== reference.configHash ||
                    current.pokieVersion !== reference.pokieVersion
                ) {
                    issues.push({
                        code: "stakeengine-cross-mode-provenance-mismatch",
                        severity: "error",
                        message: `mode "${mode.modeName}" has different provenance (game id/version, configHash, or pokieVersion) than the export's other modes.`,
                        details: {modeName: mode.modeName},
                    });
                }
            }

            if (issues.some((issue) => issue.severity === "error") || gameManifest === undefined) {
                return {outDir, files: [], manifest: undefined, issues};
            }

            const index: StakeEngineIndex = {
                modes: manifestEntries.map((entry) => ({name: entry.name, cost: entry.cost, events: entry.events, weights: entry.weights})),
            };
            const relativeFiles = [...manifestEntries.flatMap((entry) => [entry.weights, entry.events]), "index.json", "pokie-manifest.json"];
            const manifest: StakeEngineManifest = {
                schemaVersion: STAKE_ENGINE_MANIFEST_SCHEMA_VERSION,
                generatedBy: GENERATED_BY,
                pokieVersion: this.pokieVersion,
                generatedAt: this.now().toISOString(),
                game: gameManifest,
                ...(configHash !== undefined ? {configHash} : {}),
                modes: manifestEntries,
                files: relativeFiles,
            };
            fs.writeFileSync(path.join(stagingDir, "index.json"), `${JSON.stringify(index, null, 4)}\n`);
            fs.writeFileSync(path.join(stagingDir, "pokie-manifest.json"), `${JSON.stringify(manifest, null, 4)}\n`);

            assertSafeToReplaceStakeEngineExportDirectory(outDir);
            const {cleanupWarning} = publishDirectoryAtomically({
                outDir,
                renameDirectory: this.renameDirectory,
                removeDirectory: this.removeDirectory,
                writeFilesIntoTempDir: (tempDir) => {
                    for (const file of relativeFiles) {
                        this.renameDirectory(path.join(stagingDir, file), path.join(tempDir, file));
                    }
                },
            });

            const finalIssues: ValidationIssue[] =
                cleanupWarning !== undefined
                    ? [...issues, {code: "stakeengine-stale-export-cleanup-failed", severity: "warning", message: cleanupWarning, details: {outDir}}]
                    : issues;

            return {outDir, files: relativeFiles, manifest, issues: finalIssues};
        } finally {
            try {
                this.removeDirectory(stagingDir);
            } catch {
                // best-effort only.
            }
        }
    }

    // Mirrors StakeEngineExportValidator's own mode-name/cost checks exactly — duplicated rather than reused,
    // since that validator's own "validate(modes)" signature requires every mode's full library up front.
    private validateUpfront(modes: readonly StakeEngineBundleModeInput[]): ValidationIssue[] {
        const issues: ValidationIssue[] = [];
        if (modes.length === 0) {
            issues.push({code: "stakeengine-export-modes-empty", severity: "error", message: "Stake Engine export requires at least one mode."});
            return issues;
        }

        const seenNames = new Map<string, string>();
        modes.forEach((mode, position) => {
            if (typeof mode.modeName !== "string" || !(/^[A-Za-z0-9_-]+$/).test(mode.modeName)) {
                issues.push({
                    code: "stakeengine-mode-name-invalid",
                    severity: "error",
                    message: `mode at position ${position} has an invalid modeName (${JSON.stringify(mode.modeName)}); must be a non-empty string matching [A-Za-z0-9_-]+.`,
                    details: {position, modeName: mode.modeName},
                });
            } else {
                const lowerName = mode.modeName.toLowerCase();
                const existing = seenNames.get(lowerName);
                if (existing === undefined) {
                    seenNames.set(lowerName, mode.modeName);
                } else if (existing === mode.modeName) {
                    issues.push({
                        code: "stakeengine-duplicate-mode-name",
                        severity: "error",
                        message: `modeName "${mode.modeName}" is used by more than one mode.`,
                        details: {modeName: mode.modeName},
                    });
                } else {
                    issues.push({
                        code: "stakeengine-mode-name-case-collision",
                        severity: "error",
                        message: `modeName "${mode.modeName}" differs only in case from modeName "${existing}"; these would write the same files ("lookup_${mode.modeName}.csv"/"books_${mode.modeName}.jsonl.zst") on a case-insensitive filesystem.`,
                        details: {modeName: mode.modeName, collidesWith: existing},
                    });
                }
            }

            if (!Number.isFinite(mode.cost) || mode.cost <= 0) {
                issues.push({
                    code: "stakeengine-mode-cost-invalid",
                    severity: "error",
                    message: `mode "${mode.modeName}" has an invalid cost (${mode.cost}); must be a finite number > 0.`,
                    details: {modeName: mode.modeName, cost: mode.cost},
                });
            }
        });

        return issues;
    }

    // Streams "mode"'s outcomes straight from the bundle into this mode's own CSV/books files (in the staging
    // directory), one outcome at a time — never holding more than one outcome, or the whole mode's CSV/books
    // content, in memory at once. Returns undefined (having already pushed every problem found onto "issues")
    // if any outcome fails — the same "no partial mode" contract StakeEngineExporter.buildMode has.
    private async buildMode(mode: StakeEngineBundleModeInput, stagingDir: string, issues: ValidationIssue[]): Promise<BuiltMode | undefined> {
        const index = await this.reader.readModeIndex(mode.bundleDir, mode.bundleModeName);

        const csvFileName = `lookup_${mode.modeName}.csv`;
        const booksFileName = `books_${mode.modeName}.jsonl.zst`;
        const csvFd = fs.openSync(path.join(stagingDir, csvFileName), "w");
        const zstdStream = zlib.createZstdCompress();
        const booksWriteStream = fs.createWriteStream(path.join(stagingDir, booksFileName));
        zstdStream.pipe(booksWriteStream);
        const booksFinished = finished(booksWriteStream);

        let sawError = false;
        let firstArtifact: {betMode: string; stake: number; payoutMultiplier: number; provenance: {game: StakeEngineManifest["game"]; configHash?: string; pokieVersion: string}} | undefined;

        try {
            for await (const outcome of this.reader.iterateModeOutcomes(mode.bundleDir, mode.bundleModeName)) {
                if (firstArtifact === undefined) {
                    firstArtifact = outcome.artifact as never;
                }

                const id = parseStakeEngineOutcomeId(outcome.id);
                if (id === undefined) {
                    issues.push({
                        code: "stakeengine-outcome-id-not-integer",
                        severity: "error",
                        message: `mode "${mode.modeName}": outcome id "${outcome.id}" is not a canonical non-negative integer string, as Stake Engine requires.`,
                        details: {modeName: mode.modeName, id: outcome.id},
                    });
                    sawError = true;
                    continue;
                }
                if (!Number.isInteger(outcome.weight)) {
                    issues.push({
                        code: "stakeengine-outcome-weight-not-integer",
                        severity: "error",
                        message: `mode "${mode.modeName}": outcome "${outcome.id}" has a non-integer weight (${outcome.weight}); Stake Engine requires integer weights.`,
                        details: {modeName: mode.modeName, id: outcome.id, weight: outcome.weight},
                    });
                    sawError = true;
                    continue;
                }

                let events: readonly StakeEngineEvent[];
                try {
                    events = this.eventsProjector.project(outcome.artifact, {cost: mode.cost});
                } catch (error) {
                    issues.push({
                        code: "stakeengine-outcome-events-invalid",
                        severity: "error",
                        message: `mode "${mode.modeName}": outcome "${outcome.id}": events projector failed: ${error instanceof Error ? error.message : String(error)}`,
                        details: {modeName: mode.modeName, id: outcome.id},
                    });
                    sawError = true;
                    continue;
                }

                try {
                    toCanonicalJson(events);
                } catch (error) {
                    issues.push({
                        code: "stakeengine-outcome-events-not-json-safe",
                        severity: "error",
                        message: `mode "${mode.modeName}": outcome "${outcome.id}": events are not JSON-safe: ${error instanceof InvalidJsonValueError ? error.message : String(error)}`,
                        details: {modeName: mode.modeName, id: outcome.id},
                    });
                    sawError = true;
                    continue;
                }

                const stakePayoutMultiplier = convertRatioToStakeUnits(outcome.artifact.payoutMultiplier, mode.cost);
                if (stakePayoutMultiplier === undefined) {
                    issues.push({
                        code: "stakeengine-outcome-payout-multiplier-not-representable",
                        severity: "error",
                        message:
                            `mode "${mode.modeName}": outcome "${outcome.id}"'s artifact.payoutMultiplier (${outcome.artifact.payoutMultiplier}) is not representable as a ` +
                            `non-negative safe integer once converted to Stake units (payoutMultiplier * cost (${mode.cost}) * 100).`,
                        details: {modeName: mode.modeName, id: outcome.id, payoutMultiplier: outcome.artifact.payoutMultiplier, cost: mode.cost},
                    });
                    sawError = true;
                    continue;
                }

                if (sawError) {
                    // An earlier outcome in this same mode already failed — this mode is discarded regardless,
                    // so writing any more content is pointless — but the for-await loop keeps consuming the
                    // stream so a later outcome's own problems still get reported in this same run.
                    continue;
                }

                fs.writeSync(csvFd, `${id},${outcome.weight},${stakePayoutMultiplier}\n`);
                const bookLine: StakeEngineBookLine = {id, events, payoutMultiplier: stakePayoutMultiplier};
                const canWriteMore = zstdStream.write(`${JSON.stringify(bookLine)}\n`);
                if (!canWriteMore) {
                    await once(zstdStream, "drain");
                }
            }
        } finally {
            fs.closeSync(csvFd);
            zstdStream.end();
            await booksFinished;
        }

        if (sawError || firstArtifact === undefined) {
            return undefined;
        }

        return {
            manifestEntry: {
                name: mode.modeName,
                betMode: firstArtifact.betMode,
                stake: firstArtifact.stake,
                cost: mode.cost,
                outcomeCount: index.outcomeCount,
                libraryId: index.libraryId,
                libraryHash: index.libraryHash,
                events: booksFileName,
                weights: csvFileName,
            },
            provenance: firstArtifact.provenance,
        };
    }
}
