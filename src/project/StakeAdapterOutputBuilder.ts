import {computeProjectInputBindingHash} from "./FormatConversionPlanner.js";
import fs from "fs";
import path from "path";
import type {StakeEngineExactSource} from "../stakeengine/StakeEngineExactSource.js";
import {publishExactStakeSource, validateExactStakeSource} from "../stakeengine/internal/publishExactStakeSource.js";
import {recognizesNativeStakeTuningManifest} from "../optimization/internal/NativeStakeTuningManifest.js";
import {StakeEngineExporter} from "../stakeengine/StakeEngineExporter.js";
import {capturePublishDirectoryOwnership, removePublishedDirectoryIfOwned, type PublishedDirectoryOwnership} from "../stakeengine/internal/publishDirectoryAtomically.js";
import type {StakeEngineExporting} from "../stakeengine/StakeEngineExporting.js";
import {StakeEngineImporter} from "../stakeengine/StakeEngineImporter.js";
import type {StakeEngineImporting} from "../stakeengine/StakeEngineImporting.js";
import type {BuildOutputBuilder} from "./BuildOutputBuilder.js";
import type {BuildOutputResult} from "./BuildOutputResult.js";
import {
    assertBuildNotCancelled,
    BuildCancelledError,
    reportBuildProgress,
    type BuildOutputOptions,
    type BuildCheck,
} from "./BuildOutputOptions.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import type {PokieProject} from "./PokieProject.js";
import {OutcomeLibraryFolderReader} from "../weightedoutcome/folder/OutcomeLibraryFolderReader.js";
import {buildWeightedOutcomeLibrary} from "../weightedoutcome/buildWeightedOutcomeLibrary.js";
import type {StakeEngineExportModeInput} from "../stakeengine/StakeEngineExportModeInput.js";

// Produces a Stake Engine export from the canonical outcome-library prerequisite, or republishes an existing
// Stake export.  The former deliberately reads the bundle through its public reader and immediately hands the
// resulting libraries to StakeEngineExporter; it never recreates a game model or calculates outcomes.  This
// keeps the Outcome -> Stake hand-off in BuildOutputBuilderRegistry rather than leaving a second CLI/Studio-only
// exporter path.  Generated outcome ids are content-addressed and Stake requires decimal ids, so their stable
// canonical bundle order is relabelled exactly once at this integration boundary.
export class StakeAdapterOutputBuilder implements BuildOutputBuilder {
    public readonly target = "stakeAdapter";
    public readonly destinationKind = "directory";

    private readonly importer: StakeEngineImporting;
    private readonly exporter: StakeEngineExporting;

    constructor(
        pokieVersion: string,
        importer: StakeEngineImporting = new StakeEngineImporter(),
        exporter: StakeEngineExporting = new StakeEngineExporter(pokieVersion),
    ) {
        this.importer = importer;
        this.exporter = exporter;
    }

    public async validate(source: PokieProject): Promise<void> {
        if (source.type === "outcomeLibrary") {
            await this.readOutcomeLibraryModes(source.rootPath);
            return;
        }
        await this.readStakeSource(source.rootPath);
    }

    /** Read-only estimate for the exact source a prepared Stake operation selected. */
    public async inspectPreflight(source: PokieProject): Promise<BuildCheck> {
        const prepared = source.type === "outcomeLibrary" ? {modes: await this.readOutcomeLibraryModes(source.rootPath), exactSource: undefined} : await this.readStakeSource(source.rootPath);
        return prepared.exactSource ? exactPreflight(prepared.exactSource) : stakePreflight(prepared.modes);
    }

    public async build(source: PokieProject, destinationPath: string, options?: BuildOutputOptions): Promise<BuildOutputResult> {
        assertBuildNotCancelled(options);
        assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
        assertArtifactDestinationIsSafe(source.rootPath, destinationPath);
        const destinationOwnership = capturePublishDirectoryOwnership(destinationPath);

        const sourceBinding = computeProjectInputBindingHash(source);
        const assertSourceUnchanged = () => {
            if (sourceBinding !== computeProjectInputBindingHash(source)) throw new Error("Stake source changed during preparation; prepare a new preview before publication.");
        };
        let publication: PublishedDirectoryOwnership | undefined;
        try {
            const prepared = source.type === "outcomeLibrary" ? {modes: await this.readOutcomeLibraryModes(source.rootPath), exactSource: undefined} : await this.readStakeSource(source.rootPath);
            const exact = prepared.exactSource;
            if (exact) {
                const preflight = exactPreflight(exact);
                reportBuildProgress(options, {status: "preflight", preflight, message: "Validated exact Stake payload; native numeric sampling is unavailable"});
                assertBuildNotCancelled(options);
                assertSourceUnchanged();
                const result = publishExactStakeSource(exact, destinationPath, {
                    signal: options?.signal,
                    destinationOwnership,
                    onProgress: progress => reportBuildProgress(options, {status: "running", preflight, phase: progress.phase ?? progress.message, unit: progress.unit, completed: progress.completed, total: progress.total, message: progress.message}),
                });
                publication = result.publication;
                assertBuildNotCancelled(options);
                reportBuildProgress(options, {status: "completed", preflight});
                return {outputPath: result.outDir, preflight, stakeManifest: result.manifest, stakeFiles: result.files, publishedStakeDirectoryOwnership: publication === undefined ? undefined : {...publication, restoreEmptyOnRollback: destinationOwnership.destinationIdentity !== undefined}};
            }
            const modes = prepared.modes;
            const preflight = stakePreflight(modes);
            reportBuildProgress(options, {status: "preflight", preflight, message: "Inspecting Stake books"});
            assertBuildNotCancelled(options);

            let completed = BigInt(0);
            for (const mode of modes) {
                completed += BigInt(mode.library.outcomes.length);
                reportBuildProgress(options, {status: "running", phase: "Preparing Stake modes", unit: "outcome records", completed, total: preflight.estimatedItemCount, preflight, message: `Prepared Stake mode ${mode.modeName}`});
                assertBuildNotCancelled(options);
            }
            reportBuildProgress(options, {status: "running", phase: "Preparing Stake publication", preflight, message: "Publishing Stake export"});
            assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
            assertSourceUnchanged();
            const result = await this.exporter.exportToDirectory(modes, destinationPath, {
                signal: options?.signal,
                destinationOwnership,
                onProgress: (progress) => {
                    reportBuildProgress(options, {
                        status: "running",
                        phase: progress.phase ?? progress.message,
                        unit: progress.unit,
                        completed: progress.completed,
                        total: progress.total,
                        preflight,
                        message: progress.message,
                    });
                },
            });
            publication = result.publication;
            assertBuildNotCancelled(options);
            const exportErrors = result.issues.filter((issue) => issue.severity === "error");
            if (exportErrors.length > 0 || result.manifest === undefined) {
                throw new Error(
                    `Could not republish Stake Engine export "${source.rootPath}" to "${destinationPath}": ${exportErrors
                        .map((issue) => `${issue.code}: ${issue.message}`)
                        .join("; ")}`,
                );
            }

            reportBuildProgress(options, {status: "completed", preflight});
            return {outputPath: result.outDir, preflight, stakeManifest: result.manifest, stakeFiles: result.files, publishedStakeDirectoryOwnership: publication === undefined ? undefined : {...publication, restoreEmptyOnRollback: destinationOwnership.destinationIdentity !== undefined}};
        } catch (error) {
            // Atomic publishers clean their staging on failure. Only a returned ownership token
            // authorizes removal of a public path; a claimant may have appeared during source reads.
            if (publication !== undefined) {
                removePublishedDirectoryIfOwned(publication);
            }
            if (options?.signal?.aborted) {
                if (!(error instanceof BuildCancelledError)) assertBuildNotCancelled(options);
            } else reportBuildProgress(options, {status: "failed", message: "Stake export failed"});
            throw error;
        }
    }

    private async readStakeSource(sourcePath: string): Promise<{modes: readonly StakeEngineExportModeInput[]; exactSource?: StakeEngineExactSource}> {
        if (recognizesNativeStakeTuningManifest(sourcePath)) {
            // Keep the optimizer's complete inventory and archived input provenance, including its
            // native manifest. Never resurrect that archive as current library provenance.
            const files: Record<string, string> = {};
            for (const name of fs.readdirSync(sourcePath)) {
                const file = path.join(sourcePath, name);
                if (!fs.lstatSync(file).isFile()) throw new Error(`Unsupported native Stake companion: ${name}`);
                files[name] = fs.readFileSync(file).toString("base64");
            }
            const exact = {files};
            validateExactStakeSource(exact);
            if (!recognizesNativeStakeTuningManifest(sourcePath)) throw new Error("Native Stake source changed during capture.");
            return {modes: [], exactSource: exact};
        }
        const imported = await this.importer.importFromDirectory(sourcePath);
        const errors = imported.issues.filter(issue => issue.severity === "error");
        if (errors.length) throw new Error(errors.map(issue => `${issue.code}: ${issue.message}`).join("; "));
        return {modes: imported.modes, ...(imported.exactSource === undefined ? {} : {exactSource: imported.exactSource})};
    }

    private async readOutcomeLibraryModes(sourcePath: string): Promise<readonly StakeEngineExportModeInput[]> {
        const reader = new OutcomeLibraryFolderReader();
        const manifest = await reader.readManifest(sourcePath);
        const provenanceFile = path.join(sourcePath, "source-provenance.json");
        const sourceProvenance = fs.existsSync(provenanceFile) ? JSON.parse(fs.readFileSync(provenanceFile, "utf8")) as import("../stakeengine/StakeEngineImportSourceProvenance.js").StakeEngineImportSourceProvenance : undefined;
        return Promise.all(
            manifest.modes.map(async (entry) => {
                const library = await reader.readLibrary(sourcePath, entry.modeName);
                return {
                    modeName: entry.modeName,
                    cost: entry.stake,
                    library: buildWeightedOutcomeLibrary({
                        libraryId: library.libraryId,
                        schemaVersion: library.schemaVersion,
                        outcomes: library.outcomes.map((outcome, index) => ({...outcome, id: String(index)})),
                    }),
                    ...(sourceProvenance === undefined ? {} : {sourceProvenance}),
                    ...(entry.generator === undefined ? {} : {generator: entry.generator}),
                };
            }),
        );
    }
}

function stakePreflight(modes: readonly StakeEngineExportModeInput[]): BuildCheck {
    const estimatedItemCount = modes.reduce((total, mode) => total + BigInt(mode.library.outcomes.length), BigInt(0));
    // Stake's exported books are compressed, so the in-memory canonical JSON is a conservative complexity
    // signal rather than a misleading promise about final archive size.
    const estimatedBytes = modes.reduce((total, mode) => total + BigInt(Buffer.byteLength(JSON.stringify(mode.library.outcomes))), BigInt(0));
    return {
        estimatedItemCount,
        estimatedBytes,
        ...(estimatedItemCount > BigInt(10_000)
            ? {complexityWarning: `Exporting ${estimatedItemCount} Stake books can take noticeable time and disk space.`}
            : {}),
    };
}

function exactPreflight(source: StakeEngineExactSource): BuildCheck {
    const files = Object.values(source.files).map(value => Buffer.from(value, "base64"));
    const index = JSON.parse(Buffer.from(source.files["index.json"], "base64").toString("utf8")) as {modes: {weights: string}[]};
    return {
        estimatedItemCount: index.modes.reduce((total, mode) => total + BigInt(Buffer.from(source.files[mode.weights], "base64").toString("utf8").split("\n").filter(Boolean).length), BigInt(0)),
        estimatedBytes: files.reduce((total, file) => total + BigInt(file.length), BigInt(0)),
    };
}
