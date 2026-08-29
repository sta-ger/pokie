import {StakeEngineExporter} from "../stakeengine/StakeEngineExporter.js";
import type {StakeEngineExporting} from "../stakeengine/StakeEngineExporting.js";
import {StakeEngineImporter} from "../stakeengine/StakeEngineImporter.js";
import type {StakeEngineImporting} from "../stakeengine/StakeEngineImporting.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {
    assertArtifactBuildNotCancelled,
    ArtifactBuildCancelledError,
    captureArtifactDestinationState,
    cleanupIncompleteArtifactOutput,
    reportArtifactBuildProgress,
    type ArtifactBuildOptions,
    type ArtifactBuildPreflight,
} from "./ArtifactBuildOptions.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "./internal/assertArtifactDestinationIsSafe.js";
import type {PokieProject} from "./PokieProject.js";
import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import {buildWeightedOutcomeLibrary} from "../weightedoutcome/buildWeightedOutcomeLibrary.js";
import type {StakeEngineExportModeInput} from "../stakeengine/StakeEngineExportModeInput.js";

// Produces a Stake Engine export from the canonical outcome-library prerequisite, or republishes an existing
// Stake export.  The former deliberately reads the bundle through its public reader and immediately hands the
// resulting libraries to StakeEngineExporter; it never recreates a game model or calculates outcomes.  This
// keeps the Outcome -> Stake hand-off in ArtifactBuilderRegistry rather than leaving a second CLI/Studio-only
// exporter path.  Generated outcome ids are content-addressed and Stake requires decimal ids, so their stable
// canonical bundle order is relabelled exactly once at this integration boundary.
export class StakeAdapterArtifactBuilder implements ArtifactBuilder {
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
        await this.readStakeModes(source.rootPath);
    }

    public async build(source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        assertArtifactBuildNotCancelled(options);
        assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
        assertArtifactDestinationIsSafe(source.rootPath, destinationPath);
        const destinationState = captureArtifactDestinationState(destinationPath, this.destinationKind);

        try {
            const modes = source.type === "outcomeLibrary" ? await this.readOutcomeLibraryModes(source.rootPath) : await this.readStakeModes(source.rootPath);
            const preflight = stakePreflight(modes);
            reportArtifactBuildProgress(options, {status: "preflight", preflight, message: "Inspecting Stake books"});
            assertArtifactBuildNotCancelled(options);

            let completed = BigInt(0);
            for (const mode of modes) {
                completed += BigInt(mode.library.outcomes.length);
                reportArtifactBuildProgress(options, {status: "running", completed, total: preflight.estimatedItemCount, preflight, message: `Prepared Stake mode ${mode.modeName}`});
                assertArtifactBuildNotCancelled(options);
            }
            reportArtifactBuildProgress(options, {status: "running", completed, total: preflight.estimatedItemCount, preflight, message: "Publishing Stake export"});
            const result = await this.exporter.exportToDirectory(modes, destinationPath, {
                signal: options?.signal,
                onProgress: (progress) => {
                    reportArtifactBuildProgress(options, {
                        status: "running",
                        completed: progress.completed,
                        total: preflight.estimatedItemCount,
                        preflight,
                        message: progress.message,
                    });
                },
            });
            assertArtifactBuildNotCancelled(options);
            const exportErrors = result.issues.filter((issue) => issue.severity === "error");
            if (exportErrors.length > 0 || result.manifest === undefined) {
                throw new Error(
                    `Could not republish Stake Engine export "${source.rootPath}" to "${destinationPath}": ${exportErrors
                        .map((issue) => `${issue.code}: ${issue.message}`)
                        .join("; ")}`,
                );
            }

            reportArtifactBuildProgress(options, {status: "completed", completed: preflight.estimatedItemCount, total: preflight.estimatedItemCount, preflight});
            return {outputPath: result.outDir, preflight, stakeManifest: result.manifest, stakeFiles: result.files};
        } catch (error) {
            await cleanupIncompleteArtifactOutput(destinationPath, destinationState);
            if (options?.signal?.aborted) {
                if (!(error instanceof ArtifactBuildCancelledError)) assertArtifactBuildNotCancelled(options);
            } else reportArtifactBuildProgress(options, {status: "failed", message: "Stake export failed"});
            throw error;
        }
    }

    private async readStakeModes(sourcePath: string): Promise<readonly StakeEngineExportModeInput[]> {
        const imported = await this.importer.importFromDirectory(sourcePath);
        const importErrors = imported.issues.filter((issue) => issue.severity === "error");
        if (importErrors.length > 0) {
            throw new Error(
                `Could not read Stake Engine export "${sourcePath}": ${importErrors.map((issue) => `${issue.code}: ${issue.message}`).join("; ")}`,
            );
        }
        return imported.modes;
    }

    private async readOutcomeLibraryModes(sourcePath: string): Promise<readonly StakeEngineExportModeInput[]> {
        const reader = new OutcomeLibraryBundleReader();
        const manifest = await reader.readManifest(sourcePath);
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
                };
            }),
        );
    }
}

function stakePreflight(modes: readonly StakeEngineExportModeInput[]): ArtifactBuildPreflight {
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
