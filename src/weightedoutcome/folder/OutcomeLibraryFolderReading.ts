import type {WeightedOutcomeRandomSource} from "../../pregenerated/WeightedOutcomeRandomSource.js";
import type {WeightedOutcome} from "../WeightedOutcome.js";
import type {WeightedOutcomeLibrary} from "../WeightedOutcomeLibrary.js";
import type {OutcomeLibraryFolderManifest} from "./OutcomeLibraryFolderManifest.js";
import type {OutcomeLibraryFolderModeIndex} from "./OutcomeLibraryFolderModeIndex.js";

// Three genuinely different ways to read a bundle, none of which materialize more than they have to:
// - iterateModeOutcomes: full sequential streaming, one outcome in memory at a time.
// - readOutcomeById / drawOutcome: exactly one outcome loaded, via the mode's own small index.
// - readLibrary: the "give me everything" convenience, for a caller (the Stake exporter, the pre-generated
//   runtime) that needs a full in-memory WeightedOutcomeLibrary anyway — the one shared path both of those
//   integration points call, so they can never end up disagreeing about what a bundle contains.
export interface OutcomeLibraryFolderReading<T extends string | number = string> {
    readManifest(libraryDir: string): Promise<OutcomeLibraryFolderManifest>;

    readModeIndex(libraryDir: string, modeName: string): Promise<OutcomeLibraryFolderModeIndex>;

    iterateModeOutcomes(libraryDir: string, modeName: string): AsyncIterable<WeightedOutcome<T>>;

    readOutcomeById(libraryDir: string, modeName: string, id: string): Promise<WeightedOutcome<T> | undefined>;

    drawOutcome(libraryDir: string, modeName: string, randomSource: WeightedOutcomeRandomSource): Promise<WeightedOutcome<T>>;

    readLibrary(libraryDir: string, modeName: string): Promise<WeightedOutcomeLibrary<T>>;
}
