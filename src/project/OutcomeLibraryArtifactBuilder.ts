import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import type {OutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleModeInput.js";
import {OutcomeLibraryBundleWriter} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriter.js";
import type {OutcomeLibraryBundleWriting} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriting.js";
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

// (Re)publishes an already-built "outcomeLibrary" bundle to a new destination, atomically -- every mode's
// manifest entry is read back (OutcomeLibraryBundleReader.readManifest), each mode's full outcome set is
// loaded (OutcomeLibraryBundleReader.readLibrary, the same reader loadWeightedOutcomeLibraryFromBundle wraps),
// and the result is streamed straight into OutcomeLibraryBundleWriter -- a WeightedOutcomeLibrary's own
// "outcomes" array is already exactly the Iterable<WeightedOutcomeInput> shape OutcomeLibraryBundleModeInput
// expects, so no field mapping happens here. Blueprint materialization is deliberately not an ArtifactBuilder
// operation: ArtifactBuilderRegistry's managed workflow owns generation, verification, registration and reopen
// as one lifecycle, so this public builder can never leave an unregistered Blueprint-derived bundle behind.
export class OutcomeLibraryArtifactBuilder implements ArtifactBuilder {
    public readonly target = "outcomeLibrary";
    public readonly destinationKind = "directory";

    private readonly reader: OutcomeLibraryBundleReading;
    private readonly writer: OutcomeLibraryBundleWriting;

    constructor(
        pokieVersion: string,
        reader: OutcomeLibraryBundleReading = new OutcomeLibraryBundleReader(),
        writer: OutcomeLibraryBundleWriting = new OutcomeLibraryBundleWriter(pokieVersion),
    ) {
        this.reader = reader;
        this.writer = writer;
    }

    public async validate(source: PokieProject): Promise<void> {
        if (source.type !== "outcomeLibrary") {
            throw new Error('OutcomeLibraryArtifactBuilder only validates an "outcomeLibrary" project.');
        }
        const manifest = await this.reader.readManifest(source.rootPath);
        for (const entry of manifest.modes) {
            await this.reader.readLibrary(source.rootPath, entry.modeName);
        }
    }

    public async build(source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        assertArtifactBuildNotCancelled(options);
        assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
        assertArtifactDestinationIsSafe(source.rootPath, destinationPath);
        const destinationState = captureArtifactDestinationState(destinationPath, this.destinationKind);

        if (source.type !== "outcomeLibrary") {
            throw new Error(
                `OutcomeLibraryArtifactBuilder only republishes an "outcomeLibrary" project; ` +
                    `Blueprint conversion must use ArtifactBuilderRegistry.build("outcomeLibrary", source, destinationPath).`,
            );
        }

        try {
            const manifest = await this.reader.readManifest(source.rootPath);
            const preflight = outcomePreflight(manifest);
            reportArtifactBuildProgress(options, {status: "preflight", preflight, message: "Inspecting outcome-library modes"});
            assertArtifactBuildNotCancelled(options);
            const modes: OutcomeLibraryBundleModeInput[] = [];
            let completed = BigInt(0);
            for (const entry of manifest.modes) {
                const library = await this.reader.readLibrary(source.rootPath, entry.modeName);
                modes.push({
                    modeName: entry.modeName,
                    libraryId: library.libraryId,
                    schemaVersion: library.schemaVersion,
                    outcomes: library.outcomes,
                    generator: entry.generator,
                });
                completed += BigInt(entry.outcomeCount);
                reportArtifactBuildProgress(options, {status: "running", completed, total: preflight.estimatedItemCount, preflight, message: `Loaded mode ${entry.modeName}`});
                assertArtifactBuildNotCancelled(options);
            }

            reportArtifactBuildProgress(options, {status: "running", completed, total: preflight.estimatedItemCount, preflight, message: "Publishing outcome-library bundle"});
            const result = await this.writer.writeToDirectory(modes, destinationPath, {
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
            const errors = result.issues.filter((issue) => issue.severity === "error");
            if (errors.length > 0 || result.manifest === undefined) {
                throw new Error(
                    `Could not republish outcome-library bundle "${source.rootPath}" to "${destinationPath}": ${errors
                        .map((issue) => `${issue.code}: ${issue.message}`)
                        .join("; ")}`,
                );
            }

            reportArtifactBuildProgress(options, {status: "completed", completed: preflight.estimatedItemCount, total: preflight.estimatedItemCount, preflight});
            return {outputPath: result.outDir, preflight};
        } catch (error) {
            await cleanupIncompleteArtifactOutput(destinationPath, destinationState);
            if (options?.signal?.aborted) {
                if (!(error instanceof ArtifactBuildCancelledError)) assertArtifactBuildNotCancelled(options);
            } else reportArtifactBuildProgress(options, {status: "failed", message: "Outcome-library publishing failed"});
            throw error;
        }
    }
}

function outcomePreflight(manifest: Awaited<ReturnType<OutcomeLibraryBundleReading["readManifest"]>>): ArtifactBuildPreflight {
    const estimatedItemCount = manifest.modes.reduce((total, mode) => total + BigInt(mode.outcomeCount), BigInt(0));
    return {
        estimatedItemCount,
        ...(estimatedItemCount > BigInt(10_000)
            ? {complexityWarning: `Republishing ${estimatedItemCount} outcomes can take noticeable time and disk space.`}
            : {}),
    };
}
