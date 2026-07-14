import type {WeightedOutcome} from "../weightedoutcome/WeightedOutcome.js";
import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";
import type {WeightedOutcomeRandomSource} from "./WeightedOutcomeRandomSource.js";

// A WeightedOutcomeLibrary describes a whole distribution; something still has to draw one point from
// it at runtime. WeightedOutcomeSelector is the standard, ready-made implementation — implement this
// directly for a different selection strategy (e.g. one that excludes already-seen ids within a
// session) without touching WeightedOutcomeLibrary itself.
export interface WeightedOutcomeSelecting {
    select<T extends string | number = string>(
        library: WeightedOutcomeLibrary<T>,
        randomSource: WeightedOutcomeRandomSource,
    ): WeightedOutcome<T>;
}
