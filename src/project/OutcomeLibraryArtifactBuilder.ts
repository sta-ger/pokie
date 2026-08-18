import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import type {OutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleModeInput.js";
import {OutcomeLibraryBundleWriter} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriter.js";
import fs from "fs";
import type {OutcomeLibraryBundleWriting} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriting.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {
    assertArtifactBuildNotCancelled,
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

    public async build(source: PokieProject, destinationPath: string, options?: ArtifactBuildOptions): Promise<ArtifactBuildResult> {
        assertArtifactBuildNotCancelled(options);
        assertArtifactDestinationAvailable(destinationPath, this.destinationKind);
        assertArtifactDestinationIsSafe(source.rootPath, destinationPath);

        if (source.type !== "outcomeLibrary") {
            throw new Error(
                `OutcomeLibraryArtifactBuilder only republishes an "outcomeLibrary" project; ` +
                    `Blueprint conversion must use ArtifactBuilderRegistry.build("outcomeLibrary", source, destinationPath).`,
            );
        }

        const manifest = await this.reader.readManifest(source.rootPath);
        const preflight = outcomePreflight(manifest);
        reportArtifactBuildProgress(options, {status: "preflight", preflight});
        assertArtifactBuildNotCancelled(options);
        const modes: OutcomeLibraryBundleModeInput[] = await Promise.all(
            manifest.modes.map(async (entry) => {
                const library = await this.reader.readLibrary(source.rootPath, entry.modeName);
                return {
                    modeName: entry.modeName,
                    libraryId: library.libraryId,
                    schemaVersion: library.schemaVersion,
                    outcomes: library.outcomes,
                    generator: entry.generator,
                };
            }),
        );

        reportArtifactBuildProgress(options, {status: "running", completed: BigInt(0), total: preflight.estimatedItemCount});
        assertArtifactBuildNotCancelled(options);
        const result = await this.writer.writeToDirectory(modes, destinationPath);
        if (options?.signal?.aborted) {
            await fs.promises.rm(destinationPath, {recursive: true, force: true}).catch(() => undefined);
            assertArtifactBuildNotCancelled(options);
        }
        const errors = result.issues.filter((issue) => issue.severity === "error");
        if (errors.length > 0 || result.manifest === undefined) {
            throw new Error(
                `Could not republish outcome-library bundle "${source.rootPath}" to "${destinationPath}": ${errors
                    .map((issue) => `${issue.code}: ${issue.message}`)
                    .join("; ")}`,
            );
        }

        reportArtifactBuildProgress(options, {status: "completed", completed: preflight.estimatedItemCount, total: preflight.estimatedItemCount});
        return {outputPath: result.outDir, preflight};
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
