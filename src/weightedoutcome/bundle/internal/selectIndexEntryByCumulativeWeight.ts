import {isPositiveSafeInteger} from "../../../pregenerated/internal/isPositiveSafeInteger.js";
import type {WeightedOutcomeRandomSource} from "../../../pregenerated/WeightedOutcomeRandomSource.js";
import {WeightedOutcomeSelectionError} from "../../../pregenerated/WeightedOutcomeSelectionError.js";
import type {OutcomeLibraryBundleIndexEntry} from "../OutcomeLibraryBundleModeIndex.js";

// Mirrors WeightedOutcomeSelector's own algorithm exactly — "walk exact integer cumulative sums against
// randomSource.nextInt(totalWeight), in canonical id order" (see that class's own doc comment for the full
// rationale: exact integer weights, unbiased rejection-sampling draw, no floating-point rounding anywhere in
// the decision) — deliberately duplicated here rather than calling WeightedOutcomeSelector.select directly:
// that method's own type requires every outcome's full RoundArtifact, which is exactly what a streaming,
// index-only weighted draw exists to avoid loading. OutcomeLibraryBundleReader.test.ts cross-checks this
// against WeightedOutcomeSelector's own pick for the same inputs, so the two can never silently diverge.
export function selectIndexEntryByCumulativeWeight(
    modeName: string,
    entries: readonly OutcomeLibraryBundleIndexEntry[],
    randomSource: WeightedOutcomeRandomSource,
): OutcomeLibraryBundleIndexEntry {
    if (entries.length === 0) {
        throw new WeightedOutcomeSelectionError(
            "weighted-outcome-selection-library-empty",
            `Cannot select an outcome from mode "${modeName}": it has no outcomes.`,
        );
    }

    let totalWeight = 0;
    for (const entry of entries) {
        if (!isPositiveSafeInteger(entry.weight)) {
            throw new WeightedOutcomeSelectionError(
                "weighted-outcome-selection-weight-invalid",
                `Cannot select from mode "${modeName}": outcome "${entry.id}" has weight ${entry.weight}, but selection requires a positive safe integer.`,
            );
        }
        totalWeight += entry.weight;
        if (!Number.isSafeInteger(totalWeight)) {
            throw new WeightedOutcomeSelectionError(
                "weighted-outcome-selection-total-weight-invalid",
                `Cannot select from mode "${modeName}": the sum of all outcome weights exceeds Number.MAX_SAFE_INTEGER.`,
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
    for (const entry of entries) {
        cumulative += entry.weight;
        if (point < cumulative) {
            return entry;
        }
    }
    // Unreachable given exact integer arithmetic — point is always < totalWeight, which is exactly the final
    // cumulative sum — so this is a real error (e.g. a corrupted entries array mutated after the totalWeight
    // loop above) rather than a silent fallback to some arbitrary entry.
    throw new WeightedOutcomeSelectionError(
        "weighted-outcome-selection-unreachable",
        `Cannot select from mode "${modeName}": no outcome's cumulative weight reached the drawn point ${point} (total weight ${totalWeight}).`,
    );
}
