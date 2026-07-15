import type {WeightedOutcome} from "../weightedoutcome/WeightedOutcome.js";
import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";
import {isPositiveSafeInteger} from "./internal/isPositiveSafeInteger.js";
import type {WeightedOutcomeRandomSource} from "./WeightedOutcomeRandomSource.js";
import {WeightedOutcomeSelectionError} from "./WeightedOutcomeSelectionError.js";
import type {WeightedOutcomeSelecting} from "./WeightedOutcomeSelecting.js";

// Draws exactly one outcome from a WeightedOutcomeLibrary, proportional to each outcome's own weight —
// the runtime counterpart to WeightedOutcomeLibraryAnalyzer's exact statistics: instead of describing
// the whole distribution, this samples a single point from it. Never runs a game's own calculation
// path — the returned WeightedOutcome (and its RoundArtifact) is exactly the one already stored in the
// library, untouched.
//
// Selection requires every outcome's weight — and their sum — to be a positive safe integer (see
// Number.isSafeInteger): a draw is an exact integer in [0, totalWeight) (see
// WeightedOutcomeRandomSource.nextInt), walked against the outcomes' exact integer cumulative sums, in
// their existing (canonically sorted, see buildWeightedOutcomeLibrary) order. This is stricter than
// WeightedOutcomeLibrary itself requires (buildWeightedOutcomeLibrary/WeightedOutcomeLibraryAnalyzer
// accept any finite weight > 0, since exact analysis works over ratios, not draws) — a library meant
// to be *drawn from* at runtime must use integer weights so a draw can be exactly unbiased, with no
// floating-point rounding anywhere in the decision.
//
// Deterministic given the same randomSource sequence — see SeededWeightedOutcomeRandomSource for
// reproducible draws (replay, regression tests) and SecureWeightedOutcomeRandomSource for production.
//
// Assumes library is otherwise already validly built (non-empty, canonically sorted — guaranteed by
// buildWeightedOutcomeLibrary) and does not re-validate that part; validate a library from an untrusted
// source first (WeightedOutcomeLibraryValidator). Still fails fast with WeightedOutcomeSelectionError —
// including on a non-integer/overflowing weight, or a randomSource that breaks its own contract — as a
// defensive backstop rather than silently producing a wrong or biased result.
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

        let totalWeight = 0;
        for (const outcome of outcomes) {
            if (!isPositiveSafeInteger(outcome.weight)) {
                throw new WeightedOutcomeSelectionError(
                    "weighted-outcome-selection-weight-invalid",
                    `Cannot select from library "${library.libraryId}": outcome "${outcome.id}" has weight ${outcome.weight}, but selection requires a positive safe integer.`,
                );
            }
            totalWeight += outcome.weight;
            if (!Number.isSafeInteger(totalWeight)) {
                throw new WeightedOutcomeSelectionError(
                    "weighted-outcome-selection-total-weight-invalid",
                    `Cannot select from library "${library.libraryId}": the sum of all outcome weights exceeds Number.MAX_SAFE_INTEGER.`,
                );
            }
        }

        const point = randomSource.nextInt(totalWeight);
        if (!Number.isInteger(point) || point < 0 || point >= totalWeight) {
            throw new WeightedOutcomeSelectionError(
                "weighted-outcome-selection-random-source-invalid",
                `randomSource.nextInt(${totalWeight}) must return an integer in [0, ${totalWeight}), got ${point}.`,
            );
        }

        let cumulative = 0;
        for (const outcome of outcomes) {
            cumulative += outcome.weight;
            if (point < cumulative) {
                return outcome;
            }
        }
        // Unreachable given exact integer arithmetic — point is always < totalWeight, which is exactly
        // the final cumulative sum — so this is a real error (e.g. a corrupted outcomes array mutated
        // after the totalWeight loop above) rather than a silent fallback to some arbitrary outcome.
        throw new WeightedOutcomeSelectionError(
            "weighted-outcome-selection-unreachable",
            `Cannot select from library "${library.libraryId}": no outcome's cumulative weight reached the drawn point ${point} (total weight ${totalWeight}).`,
        );
    }
}
