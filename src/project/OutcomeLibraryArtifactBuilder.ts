import {OutcomeLibraryBundleReader} from "../weightedoutcome/bundle/OutcomeLibraryBundleReader.js";
import type {OutcomeLibraryBundleReading} from "../weightedoutcome/bundle/OutcomeLibraryBundleReading.js";
import type {OutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleModeInput.js";
import {OutcomeLibraryBundleWriter} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriter.js";
import type {OutcomeLibraryBundleWriting} from "../weightedoutcome/bundle/OutcomeLibraryBundleWriting.js";
import type {ArtifactBuilder} from "./ArtifactBuilder.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";
import {assertArtifactDestinationAvailable} from "./internal/assertArtifactDestinationAvailable.js";
import type {PokieProject} from "./PokieProject.js";

// (Re)publishes an already-built "outcomeLibrary" bundle to a new destination, atomically -- every mode's
// manifest entry is read back (OutcomeLibraryBundleReader.readManifest), each mode's full outcome set is
// loaded (OutcomeLibraryBundleReader.readLibrary, the same reader loadWeightedOutcomeLibraryFromBundle wraps),
// and the result is streamed straight into OutcomeLibraryBundleWriter -- a WeightedOutcomeLibrary's own
// "outcomes" array is already exactly the Iterable<WeightedOutcomeInput> shape OutcomeLibraryBundleModeInput
// expects, so no field mapping happens here. Never re-derives or recomputes anything: this is a validated
// copy/republish, not a rebuild from a game model (see ArtifactBuilderRegistry's own "outcomeLibrary"
// unsupportedNotes).
export class OutcomeLibraryArtifactBuilder implements ArtifactBuilder {
    public readonly target = "outcomeLibrary";

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

    public async build(source: PokieProject, destinationPath: string): Promise<ArtifactBuildResult> {
        assertArtifactDestinationAvailable(destinationPath, "directory");

        const manifest = await this.reader.readManifest(source.rootPath);
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

        const result = await this.writer.writeToDirectory(modes, destinationPath);
        const errors = result.issues.filter((issue) => issue.severity === "error");
        if (errors.length > 0 || result.manifest === undefined) {
            throw new Error(
                `Could not republish outcome-library bundle "${source.rootPath}" to "${destinationPath}": ${errors
                    .map((issue) => `${issue.code}: ${issue.message}`)
                    .join("; ")}`,
            );
        }

        return {outputPath: result.outDir};
    }
}
