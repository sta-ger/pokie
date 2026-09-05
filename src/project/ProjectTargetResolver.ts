import fs from "fs";
import path from "path";
import {BlueprintProjectTargetAdapter} from "./BlueprintProjectTargetAdapter.js";
import {OutcomeLibraryProjectTargetAdapter} from "./OutcomeLibraryProjectTargetAdapter.js";
import {ParWorkbookProjectTargetAdapter} from "./ParWorkbookProjectTargetAdapter.js";
import type {PokieProject} from "./PokieProject.js";
import {PROJECT_TYPE_CAPABILITIES} from "./ProjectCapabilities.js";
import {ProjectTargetAmbiguousError} from "./ProjectTargetAmbiguousError.js";
import type {ProjectResolving} from "./ProjectResolving.js";
import type {ProjectTargetTypeAdapter} from "./ProjectTargetTypeAdapter.js";
import {ProjectTargetUnsupportedError} from "./ProjectTargetUnsupportedError.js";
import {ProjectTargetMalformedError} from "./ProjectTargetMalformedError.js";
import {StakeAdapterProjectTargetAdapter} from "./StakeAdapterProjectTargetAdapter.js";
import {TsPackageProjectTargetAdapter} from "./TsPackageProjectTargetAdapter.js";
import {WasmProjectTargetAdapter, wasmComponentManifestSidecarPath} from "./WasmProjectTargetAdapter.js";
import {computeGameBlueprintHash} from "../generated/computeGameBlueprintHash.js";
import {loadGameBlueprint} from "../generated/loadGameBlueprint.js";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import {loadPokieGame} from "../gamepackage/loadPokieGame.js";
import {computeArtifactInputBindingHash, computeProjectInputBindingHash, type ArtifactConfigurationProvenance} from "./ArtifactConversionPlanner.js";
import {recognizeParWorkbookFile} from "./internal/looksLikeParWorkbookFile.js";
import {describeWasmSidecarFailure} from "./WasmProductContract.js";

// The one file extension resolve() explicitly rejects rather than silently reporting undefined for — see its
// ProjectTargetUnsupportedError usage below.
const WASM_FILE_EXTENSION = ".wasm";

// The default, fixed set of per-ProjectType adapters ProjectTargetResolver registers when constructed without
// an explicit list — one per resolvable ProjectType, including "wasm" via WasmProjectTargetAdapter. That
// adapter only ever recognizes a ".wasm" file paired with a sidecar PokieWasmComponentManifest it can validate
// and confirm contract-compatible (see its own doc comment and docs/wasm-compatibility-boundary.md) — an
// ordinary ".wasm" file with no such sidecar is simply not recognized by it, the same as before this adapter
// existed. But unlike a genuinely unrelated unrecognized path, resolve() still special-cases that one
// extension below to throw ProjectTargetUnsupportedError instead of quietly returning `undefined` when no
// adapter recognized it, so a caller pointing POKIE at a bare ".wasm" file learns *why* it was rejected rather
// than mistaking it for "not a POKIE target at all".
const DEFAULT_PROJECT_TARGET_ADAPTERS: readonly ProjectTargetTypeAdapter[] = [
    new TsPackageProjectTargetAdapter(),
    new StakeAdapterProjectTargetAdapter(),
    new OutcomeLibraryProjectTargetAdapter(),
    new BlueprintProjectTargetAdapter(),
    new ParWorkbookProjectTargetAdapter(),
    new WasmProjectTargetAdapter(),
];

type ProjectTargetMatch = {readonly adapter: ProjectTargetTypeAdapter; readonly provenance: string};

// The concrete ProjectResolving: resolves a single given path by checking it against every registered
// per-type adapter matching its own file/directory kind, and stamping the one adapter that recognizes it (see
// PokieProject's own "capabilities"/"provenance" fields) — the only format-detection entry point migrated
// POKIE operations should use, rather than each command/service re-deriving its own "what kind of thing is
// this path" answer (see ProjectResolving's own doc comment). Deliberately resolves exactly `targetPath` — it
// does not walk up looking for an ancestor project root the way findPokieProjectRoot does; that remains
// findPokieProjectRoot's own, narrower job, layered on top of this resolver rather than duplicated into it.
//
// Registration order is fixed (see DEFAULT_PROJECT_TARGET_ADAPTERS) but doesn't affect which type a target
// resolves to: every adapter matching a target's own kind (file/directory) is checked, deterministically, and
// resolution depends only on how many of them recognize the target — zero (undefined), exactly one (that
// type), or more than one (ProjectTargetAmbiguousError; see that class's own doc comment). Two adapters can
// only collide in the first place if the underlying on-disk shapes themselves genuinely overlap — a real
// recognition conflict, not a matter of which adapter happened to run first. An adapter's own recognize() can
// also throw ProjectTargetMalformedError when a target's manifest already signals intent to be that adapter's
// type but fails a deeper read (see that class's own doc comment) — recognizeAll() below lets that propagate
// rather than swallowing it the way an ordinary non-match is swallowed.
export class ProjectTargetResolver implements ProjectResolving {
    private readonly directoryAdapters: readonly ProjectTargetTypeAdapter[];
    private readonly fileAdapters: readonly ProjectTargetTypeAdapter[];

    constructor(adapters: readonly ProjectTargetTypeAdapter[] = DEFAULT_PROJECT_TARGET_ADAPTERS) {
        const seenTypes = new Set<string>();
        for (const adapter of adapters) {
            if (seenTypes.has(adapter.type)) {
                throw new Error(`ProjectTargetResolver was given more than one adapter for project type "${adapter.type}".`);
            }
            seenTypes.add(adapter.type);
        }

        this.directoryAdapters = adapters.filter((adapter) => adapter.targetKind === "directory");
        this.fileAdapters = adapters.filter((adapter) => adapter.targetKind === "file");
    }

    public async resolve(targetPath: string): Promise<PokieProject | undefined> {
        const resolvedPath = path.resolve(targetPath);

        let stat: fs.Stats;
        try {
            stat = await fs.promises.stat(resolvedPath);
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
                return undefined;
            }
            throw error;
        }

        let candidateAdapters: readonly ProjectTargetTypeAdapter[] = [];
        if (stat.isDirectory()) {
            candidateAdapters = this.directoryAdapters;
        } else if (stat.isFile()) {
            candidateAdapters = this.fileAdapters;
        }
        const matches = await this.recognizeAll(candidateAdapters, resolvedPath);

        if (matches.length === 0) {
            if (stat.isFile() && path.extname(resolvedPath).toLowerCase() === ".xlsx") {
                const parRecognition = await recognizeParWorkbookFile(resolvedPath);
                if (parRecognition.status === "unreadable") {
                    throw new ProjectTargetMalformedError(
                        `PAR workbook recognition could not read ${JSON.stringify(resolvedPath)} as an XLSX workbook.`,
                        {
                            targetType: "parWorkbook",
                            stage: "PAR workbook recognition",
                            recovery: "Restore a readable PAR workbook with the required Manifest, Symbols, and Paytable sheets, then retry.",
                        },
                    );
                }
                if (parRecognition.status === "incomplete") {
                    throw new ProjectTargetMalformedError(
                        `PAR workbook recognition found ${JSON.stringify(resolvedPath)} but it is missing required sheet${parRecognition.missingSheets.length === 1 ? "" : "s"}: ${parRecognition.missingSheets.map((sheet) => JSON.stringify(sheet)).join(", ")}.`,
                        {
                            targetType: "parWorkbook",
                            stage: "PAR workbook recognition",
                            recovery: "Restore the missing required PAR sheets, then retry.",
                        },
                    );
                }
            }
            if (stat.isFile() && path.extname(resolvedPath).toLowerCase() === WASM_FILE_EXTENSION) {
                throw new ProjectTargetUnsupportedError(
                    describeWasmSidecarFailure(resolvedPath, wasmComponentManifestSidecarPath(resolvedPath), "missing"),
                    {targetType: "wasm"},
                );
            }
            return undefined;
        }
        if (matches.length > 1) {
            const matchedTypes = matches.map((match) => match.adapter.type).join(", ");
            throw new ProjectTargetAmbiguousError(
                `"${resolvedPath}" matches more than one project type (${matchedTypes}); refusing to guess which one it is.`,
            );
        }

        const [{adapter, provenance}] = matches;
        const configurationProvenance = await this.configurationProvenance(adapter.type, resolvedPath);
        const project = {
            type: adapter.type,
            rootPath: resolvedPath,
            capabilities: PROJECT_TYPE_CAPABILITIES[adapter.type],
            provenance,
        } as PokieProject;
        // Keep the established enumerable project DTO stable for older command consumers while making
        // verified configuration facts available to the planner. Public planner/API payloads explicitly
        // project this field, so it is never accidentally lost at the conversion boundary.
        if (configurationProvenance !== undefined) {
            Reflect.defineProperty(project, "configurationProvenance", {value: configurationProvenance, enumerable: false});
        }
        return project;
    }

    private async recognizeAll(
        adapters: readonly ProjectTargetTypeAdapter[],
        resolvedPath: string,
    ): Promise<readonly ProjectTargetMatch[]> {
        const results = await Promise.all(
            adapters.map(async (adapter): Promise<ProjectTargetMatch | undefined> => {
                const provenance = await adapter.recognize(resolvedPath);
                return provenance === undefined ? undefined : {adapter, provenance};
            }),
        );
        return results.filter((match): match is ProjectTargetMatch => match !== undefined);
    }

    // Recognition proves an on-disk shape; this second, read-only extraction records the immutable facts
    // a conversion planner needs for reuse decisions.  A malformed optional provenance payload never makes a
    // project unrecognizable, but it also never becomes evidence that a generated output is reusable.
    private async configurationProvenance(type: PokieProject["type"], rootPath: string): Promise<ArtifactConfigurationProvenance | undefined> {
        try {
            if (type === "blueprint") {
                const blueprint = loadGameBlueprint(rootPath) as {manifest: {id: string; version: string}};
                return {
                    configurationHash: computeGameBlueprintHash(blueprint as never),
                    inputBindingHash: computeArtifactInputBindingHash([rootPath]),
                    gameId: blueprint.manifest.id,
                    gameVersion: blueprint.manifest.version,
                    manifestIdentity: `${blueprint.manifest.id}@${blueprint.manifest.version}`,
                };
            }
            if (type === "outcomeLibrary") {
                const manifest = await new OutcomeLibraryBundleReader().readManifest(rootPath);
                return {
                    configurationHash: manifest.configHash,
                    inputBindingHash: computeArtifactInputBindingHash([rootPath]),
                    pokieVersion: manifest.artifactPokieVersion,
                    gameId: manifest.game.id,
                    gameVersion: manifest.game.version,
                    manifestIdentity: `${manifest.game.id}@${manifest.game.version}`,
                };
            }
            if (type === "tsPackage") {
                const game = await loadPokieGame(rootPath);
                const manifest = game.getManifest();
                const configurationHash = game.getConfigHash?.();
                return {
                    ...(configurationHash === undefined ? {} : {configurationHash}),
                    inputBindingHash: computeProjectInputBindingHash({type, rootPath}),
                    gameId: manifest.id,
                    gameVersion: manifest.version,
                    manifestIdentity: `${manifest.id}@${manifest.version}`,
                };
            }
            if (type === "parWorkbook") {
                const inputBindingHash = computeArtifactInputBindingHash([rootPath]);
                return {configurationHash: inputBindingHash, inputBindingHash};
            }
        } catch {
            // The type adapter has already supplied the authoritative recognition outcome. Missing or
            // malformed optional provenance must fail closed for reuse, not turn into invented metadata.
        }
        return undefined;
    }
}
