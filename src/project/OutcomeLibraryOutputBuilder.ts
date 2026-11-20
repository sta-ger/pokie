import {OutcomeLibraryFolderReader} from "../weightedoutcome/folder/OutcomeLibraryFolderReader.js";
import type {OutcomeLibraryFolderReading} from "../weightedoutcome/folder/OutcomeLibraryFolderReading.js";
import type {OutcomeLibraryFolderModeInput} from "../weightedoutcome/folder/OutcomeLibraryFolderModeInput.js";
import {OutcomeLibraryFolderWriter} from "../weightedoutcome/folder/OutcomeLibraryFolderWriter.js";
import {OutcomeLibraryFolderDestinationClaimedError, type OutcomeLibraryFolderWriting} from "../weightedoutcome/folder/OutcomeLibraryFolderWriting.js";
import {removePublishedDirectoryIfOwned, type PublishedDirectoryOwnership} from "../stakeengine/internal/publishDirectoryAtomically.js";
import type {BuildOutputBuilder} from "./BuildOutputBuilder.js";
import type {BuildOutputResult} from "./BuildOutputResult.js";
import {
    assertBuildNotCancelled,
    BuildCancelledError,
    captureOutputDestinationState,
    cleanupIncompleteArtifactOutput,
    reportBuildProgress,
    type BuildOutputOptions,
    type BuildCheck,
} from "./BuildOutputOptions.js";
import {assertBuildDestinationAvailable} from "./internal/assertBuildDestinationAvailable.js";
import {assertBuildDestinationIsSafe} from "./internal/assertBuildDestinationIsSafe.js";
import type {PokieProject} from "./PokieProject.js";

// (Re)publishes an already-built "outcomeLibrary" bundle to a new destination, atomically -- every mode's
// manifest entry is read back (OutcomeLibraryFolderReader.readIndex), each mode's full outcome set is
// loaded (OutcomeLibraryFolderReader.readLibrary, the same reader loadWeightedOutcomeLibraryFromFolder wraps),
// and the result is streamed straight into OutcomeLibraryFolderWriter -- a WeightedOutcomeLibrary's own
// "outcomes" array is already exactly the Iterable<WeightedOutcomeInput> shape OutcomeLibraryFolderModeInput
// expects, so no field mapping happens here. Blueprint materialization is deliberately not an BuildOutputBuilder
// operation: BuildOutputBuilderRegistry's managed workflow owns generation, verification, registration and reopen
// as one lifecycle, so this public builder can never leave an unregistered Blueprint-derived bundle behind.
export class OutcomeLibraryOutputBuilder implements BuildOutputBuilder {
    public readonly target = "outcomeLibrary";
    public readonly destinationKind = "directory";

    private readonly reader: OutcomeLibraryFolderReading;
    private readonly writer: OutcomeLibraryFolderWriting;

    constructor(
        pokieVersion: string,
        reader: OutcomeLibraryFolderReading = new OutcomeLibraryFolderReader(),
        writer: OutcomeLibraryFolderWriting = new OutcomeLibraryFolderWriter(pokieVersion),
    ) {
        this.reader = reader;
        this.writer = writer;
    }

    public async validate(source: PokieProject): Promise<void> {
        if (source.type !== "outcomeLibrary") {
            throw new Error('OutcomeLibraryOutputBuilder only validates an "outcomeLibrary" project.');
        }
        const manifest = await this.reader.readIndex(source.rootPath);
        for (const entry of manifest.modes) {
            await this.reader.readLibrary(source.rootPath, entry.modeName);
        }
    }

    public async build(source: PokieProject, destinationPath: string, options?: BuildOutputOptions): Promise<BuildOutputResult> {
        assertBuildNotCancelled(options);
        assertBuildDestinationAvailable(destinationPath, this.destinationKind);
        assertBuildDestinationIsSafe(source.rootPath, destinationPath);
        const destinationState = captureOutputDestinationState(destinationPath, this.destinationKind);
        let finalDestinationRejected = false;

        if (source.type !== "outcomeLibrary") {
            throw new Error(
                `OutcomeLibraryOutputBuilder only republishes an "outcomeLibrary" project; ` +
                    `Blueprint conversion must use BuildOutputBuilderRegistry.build("outcomeLibrary", source, destinationPath).`,
            );
        }

        let publication: PublishedDirectoryOwnership | undefined;
        try {
            const manifest = await this.reader.readIndex(source.rootPath);
            const preflight = outcomePreflight(manifest);
            reportBuildProgress(options, {status: "preflight", preflight, message: "Inspecting outcome-library modes"});
            assertBuildNotCancelled(options);
            const modes: OutcomeLibraryFolderModeInput[] = [];
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
                completed += BigInt(library.outcomes.length);
                reportBuildProgress(options, {status: "running", phase: "Loading outcome-library modes", unit: "outcome records", completed, total: preflight.estimatedItemCount, preflight, message: `Loaded mode ${entry.modeName}`});
                assertBuildNotCancelled(options);
            }

            reportBuildProgress(options, {status: "running", phase: "Preparing outcome-library publication", preflight, message: "Publishing outcome-library bundle"});
            const result = await this.writer.writeToDirectory(modes, destinationPath, {
                signal: options?.signal,
                assertDestinationAvailable: () => {
                    try {
                        assertBuildDestinationIsSafe(source.rootPath, destinationPath);
                        assertBuildDestinationAvailable(destinationPath, this.destinationKind);
                    } catch (error) {
                        // Do not let the generic failure cleanup remove a
                        // directory claimed by another caller after our
                        // preflight. The writer's staging is still removed by
                        // its own finally block.
                        finalDestinationRejected = true;
                        throw error;
                    }
                },
                onLifecycleStage: (phase) => reportBuildProgress(options, {status: "running", phase, message: `Outcome Library ${phase}`}),
                onProgress: (progress) => {
                    reportBuildProgress(options, {
                        status: "running",
                        phase: progress.phase ?? progress.message,
                        unit: progress.unit,
                        completed: progress.completed,
                        // Writer phases use their own units (records, bytes,
                        // bundle files). A source-library record estimate is
                        // not a denominator for any of them.
                        total: progress.total,
                        preflight,
                        message: progress.message,
                    });
                },
            });
            publication = result.publication;
            assertBuildNotCancelled(options);
            const errors = result.issues.filter((issue) => issue.severity === "error");
            if (errors.length > 0 || result.index === undefined) {
                throw new Error(
                    `Could not republish outcome-library bundle "${source.rootPath}" to "${destinationPath}": ${errors
                        .map((issue) => `${issue.code}: ${issue.message}`)
                        .join("; ")}`,
                );
            }

            reportBuildProgress(options, {status: "completed", preflight});
            return {outputPath: result.outDir, preflight};
        } catch (error) {
            if (publication !== undefined) {
                removePublishedDirectoryIfOwned(publication);
            } else if (!finalDestinationRejected && !(error instanceof OutcomeLibraryFolderDestinationClaimedError)) {
                await cleanupIncompleteArtifactOutput(destinationPath, destinationState);
            }
            if (options?.signal?.aborted) {
                if (!(error instanceof BuildCancelledError)) assertBuildNotCancelled(options);
            } else reportBuildProgress(options, {status: "failed", message: "Outcome-library publishing failed"});
            throw error;
        }
    }
}

function outcomePreflight(manifest: Awaited<ReturnType<OutcomeLibraryFolderReading["readIndex"]>>): BuildCheck {
    const estimatedItemCount = manifest.modes.reduce((total, mode) => total + BigInt(mode.outcomeCount), BigInt(0));
    return {
        estimatedItemCount,
        ...(estimatedItemCount > BigInt(10_000)
            ? {complexityWarning: `Republishing ${estimatedItemCount} outcomes can take noticeable time and disk space.`}
            : {}),
    };
}
