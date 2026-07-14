import type {WeightedOutcome} from "../weightedoutcome/WeightedOutcome.js";
import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";
import type {WeightedOutcomeRandomSource} from "./WeightedOutcomeRandomSource.js";
import {WeightedOutcomeSelectionError} from "./WeightedOutcomeSelectionError.js";
import type {WeightedOutcomeSelecting} from "./WeightedOutcomeSelecting.js";

// Draws exactly one outcome from a WeightedOutcomeLibrary, proportional to each outcome's own weight —
// the runtime counterpart to WeightedOutcomeLibraryAnalyzer's exact statistics: instead of describing
// the whole distribution, this samples a single point from it. Never runs a game's own calculation
// path — the returned WeightedOutcome (and its RoundArtifact) is exactly the one already stored in the
// library, untouched.
//
// Deterministic given the same randomSource sequence — see SeededWeightedOutcomeRandomSource for
// reproducible draws (replay, regression tests) and SecureWeightedOutcomeRandomSource for production.
// A draw is a single `randomSource.nextUnitInterval()` call scaled by the library's total weight and
// walked against outcomes in their existing (canonically sorted, see buildWeightedOutcomeLibrary)
// order — so the same unit interval value always selects the same outcome, regardless of process or
// machine.
//
// Assumes library is already validly built (non-empty, canonically sorted, finite positive total
// weight — all guaranteed by buildWeightedOutcomeLibrary) and does not re-validate; validate a library
// from an untrusted source first (WeightedOutcomeLibraryValidator). Still fails fast with
// WeightedOutcomeSelectionError as a defensive backstop rather than silently producing a wrong result.
export class WeightedOutcomeSelector implements WeightedOutcomeSelecting {
    public select<T extends string | number = string>(
        library: WeightedOutcomeLibrary<T>,
        randomSource: WeightedOutcomeRandomSource,
    ): WeightedOutcome<T> {
        const outcomes = library.outcomes;
        if (outcomes.length === 0) {
            throw new WeightedOutcomeSelectionError(
                "weighted-outcome-selection-library-empty",
                `Cannot select an outcome from library "${library.libraryId}": it has no outcomes.`,
            );
        }

        const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
        if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
            throw new WeightedOutcomeSelectionError(
                "weighted-outcome-selection-total-weight-invalid",
                `Cannot select an outcome from library "${library.libraryId}": total weight must be a finite number > 0, got ${totalWeight}.`,
            );
        }

        const unit = randomSource.nextUnitInterval();
        if (!Number.isFinite(unit) || unit < 0 || unit >= 1) {
            throw new WeightedOutcomeSelectionError(
                "weighted-outcome-selection-random-source-invalid",
                `randomSource.nextUnitInterval() must return a finite number in [0, 1), got ${unit}.`,
            );
        }

        const point = unit * totalWeight;
        let cumulative = 0;
        for (const outcome of outcomes) {
            cumulative += outcome.weight;
            if (point < cumulative) {
                return outcome;
            }
        }
        // Floating-point edge case only (point is always < totalWeight === the final cumulative sum in
        // exact arithmetic) — fall back to the last outcome rather than throwing.
        return outcomes[outcomes.length - 1];
    }
}
