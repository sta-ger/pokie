import type {RoundArtifact} from "../artifact/RoundArtifact.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION, type WeightedOutcomeLibrary} from "./WeightedOutcomeLibrary.js";
import {WeightedOutcomeLibraryBuildError} from "./WeightedOutcomeLibraryBuildError.js";
import type {WeightedOutcome} from "./WeightedOutcome.js";

export type WeightedOutcomeInput<T extends string | number = string> = {
    id: string;
    weight: number;
    artifact: RoundArtifact<T>;
};

export type WeightedOutcomeLibraryBuildOptions<T extends string | number = string> = {
    libraryId: string;
    outcomes: readonly WeightedOutcomeInput<T>[];
    schemaVersion?: number;
};

// The one place a WeightedOutcomeLibrary is assembled — always from already-built RoundArtifacts, never a
// second calculation path. Fails fast with WeightedOutcomeLibraryBuildError — before any library is ever
// returned — on: an invalid libraryId/schemaVersion, an empty outcomes list, an invalid or duplicate outcome
// id, an invalid weight or artifact.payoutMultiplier, a total weight that sums to zero, or content that isn't
// JSON-safe. The returned library is deeply frozen (see deepFreeze): each outcome's own RoundArtifact is
// already immutable by construction (see WeightedOutcome's own doc comment), so nothing here needs to
// deep-copy it — only the library's own new structure (the outcomes array itself) needs building.
export function buildWeightedOutcomeLibrary<T extends string | number = string>(
    options: WeightedOutcomeLibraryBuildOptions<T>,
): WeightedOutcomeLibrary<T> {
    if (typeof options.libraryId !== "string" || options.libraryId.trim().length === 0) {
        throw new WeightedOutcomeLibraryBuildError(
            "weighted-outcome-library-id-invalid",
            `libraryId must be a non-empty string, got ${JSON.stringify(options.libraryId)}.`,
        );
    }
    if (options.outcomes.length === 0) {
        throw new WeightedOutcomeLibraryBuildError(
            "weighted-outcome-library-outcomes-empty",
            "buildWeightedOutcomeLibrary requires at least one outcome.",
        );
    }
    const schemaVersion = options.schemaVersion ?? WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION;
    if (schemaVersion !== WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION) {
        throw new WeightedOutcomeLibraryBuildError(
            "weighted-outcome-library-schema-version-invalid",
            `schemaVersion must be the current supported version (${WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION}), got ${String(schemaVersion)}.`,
        );
    }

    const seenIds = new Set<string>();
    const outcomes: WeightedOutcome<T>[] = options.outcomes.map((input, index) => {
        if (typeof input.id !== "string" || input.id.trim().length === 0) {
            throw new WeightedOutcomeLibraryBuildError(
                "weighted-outcome-id-invalid",
                `outcome at position ${index} has an invalid id, got ${JSON.stringify(input.id)}.`,
            );
        }
        if (seenIds.has(input.id)) {
            throw new WeightedOutcomeLibraryBuildError(
                "weighted-outcome-library-duplicate-id",
                `outcome id "${input.id}" is used by more than one outcome.`,
            );
        }
        seenIds.add(input.id);

        if (!Number.isFinite(input.weight) || input.weight < 0) {
            throw new WeightedOutcomeLibraryBuildError(
                "weighted-outcome-weight-invalid",
                `outcome "${input.id}" has an invalid weight (${input.weight}); must be a finite number >= 0.`,
            );
        }

        if (!Number.isFinite(input.artifact.payoutMultiplier) || input.artifact.payoutMultiplier < 0) {
            throw new WeightedOutcomeLibraryBuildError(
                "weighted-outcome-payout-multiplier-invalid",
                `outcome "${input.id}" has an invalid artifact.payoutMultiplier (${input.artifact.payoutMultiplier}); must be a finite number >= 0.`,
            );
        }

        return {id: input.id, weight: input.weight, artifact: input.artifact};
    });

    const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
    if (totalWeight <= 0) {
        throw new WeightedOutcomeLibraryBuildError(
            "weighted-outcome-library-total-weight-invalid",
            `the sum of all outcome weights must be > 0, got ${totalWeight}.`,
        );
    }

    const candidate: WeightedOutcomeLibrary<T> = {
        schemaVersion,
        libraryId: options.libraryId,
        outcomes,
    };

    try {
        toCanonicalJson(candidate);
    } catch (error) {
        const reason = error instanceof InvalidJsonValueError ? error.message : String(error);
        throw new WeightedOutcomeLibraryBuildError(
            "weighted-outcome-library-not-json-safe",
            `Built WeightedOutcomeLibrary is not JSON-safe: ${reason}`,
        );
    }

    return deepFreeze(candidate);
}
