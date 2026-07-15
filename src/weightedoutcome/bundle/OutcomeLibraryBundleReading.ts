import type {WeightedOutcomeRandomSource} from "../../pregenerated/WeightedOutcomeRandomSource.js";
import type {WeightedOutcome} from "../WeightedOutcome.js";
import type {WeightedOutcomeLibrary} from "../WeightedOutcomeLibrary.js";
import type {OutcomeLibraryBundleManifest} from "./OutcomeLibraryBundleManifest.js";
import type {OutcomeLibraryBundleModeIndex} from "./OutcomeLibraryBundleModeIndex.js";

// Three genuinely different ways to read a bundle, none of which materialize more than they have to:
// - iterateModeOutcomes: full sequential streaming, one outcome in memory at a time.
// - readOutcomeById / drawOutcome: exactly one outcome loaded, via the mode's own small index.
// - readLibrary: the "give me everything" convenience, for a caller (the Stake exporter, the pre-generated
//   runtime) that needs a full in-memory WeightedOutcomeLibrary anyway — the one shared path both of those
//   integration points call, so they can never end up disagreeing about what a bundle contains.
export interface OutcomeLibraryBundleReading<T extends string | number = string> {
    readManifest(bundleDir: string): Promise<OutcomeLibraryBundleManifest>;

    readModeIndex(bundleDir: string, modeName: string): Promise<OutcomeLibraryBundleModeIndex>;

    iterateModeOutcomes(bundleDir: string, modeName: string): AsyncIterable<WeightedOutcome<T>>;

    readOutcomeById(bundleDir: string, modeName: string, id: string): Promise<WeightedOutcome<T> | undefined>;

    drawOutcome(bundleDir: string, modeName: string, randomSource: WeightedOutcomeRandomSource): Promise<WeightedOutcome<T>>;

    readLibrary(bundleDir: string, modeName: string): Promise<WeightedOutcomeLibrary<T>>;
}
