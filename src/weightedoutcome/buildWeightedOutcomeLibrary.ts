import type {RoundArtifact} from "../artifact/RoundArtifact.js";
import {RoundArtifactValidator} from "../artifact/RoundArtifactValidator.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {ValidationRule} from "../validation/ValidationRule.js";
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
    // Injectable the same way WeightedOutcomeLibraryValidator's own artifact validator is — defaults to a real
    // RoundArtifactValidator, so a malformed-but-JSON-safe artifact (mismatched screen, inconsistent totalWin,
    // ...) is rejected here at build time rather than only being caught later by a separate validation pass.
    artifactValidator?: ValidationRule<RoundArtifact<T>>;
};

// A single outcome's provenance/betMode/stake, compared against the library's first outcome to enforce that
// every outcome describes the same underlying, paid round of the same game/config — see the "library
// homogeneity" note on buildWeightedOutcomeLibrary itself for why this matters.
type OutcomeHomogeneityKey = {
    gameId: string;
    gameVersion: string;
    configHash: string | undefined;
    pokieVersion: string;
    betMode: string;
    stake: number;
};

// Plain code-point comparison (not localeCompare, which can vary by locale/ICU version) — the canonical id
// order needs to be identical everywhere this library might be built, not just consistent within one machine.
function compareIds(a: string, b: string): number {
    if (a < b) {
        return -1;
    }
    if (a > b) {
        return 1;
    }
    return 0;
}

function homogeneityKeyOf<T extends string | number>(artifact: RoundArtifact<T>): OutcomeHomogeneityKey {
    return {
        gameId: artifact.provenance.game.id,
        gameVersion: artifact.provenance.game.version,
        configHash: artifact.provenance.configHash,
        pokieVersion: artifact.provenance.pokieVersion,
        betMode: artifact.betMode,
        stake: artifact.stake,
    };
}

// The one place a WeightedOutcomeLibrary is assembled — always from already-built RoundArtifacts, never a
// second calculation path. Fails fast with WeightedOutcomeLibraryBuildError — before any library is ever
// returned — on: an invalid libraryId/schemaVersion, an empty outcomes list, an invalid or duplicate outcome
// id, an invalid weight or artifact.payoutMultiplier, an invalid (non-finite or <= 0) artifact.stake, an
// artifact that fails RoundArtifactValidator, a total weight that isn't a finite number > 0 (covers both
// "sums to zero" and "the sum of otherwise-finite weights overflows to Infinity"), content that isn't
// JSON-safe, or a library whose outcomes don't all share the same game id/version/configHash/pokieVersion/
// betMode/stake.
//
// That last check — "library homogeneity" — exists because a WeightedOutcomeLibrary models the distribution of
// results for one specific paid bet (see docs/weighted-outcome-library.md): every outcome's artifact.stake must
// therefore be the same positive amount, not a mix of a real stake and a `0` for a free-games round captured as
// its own outcome. A free-games (or any other multi-step) round belongs inside the *same* RoundArtifact as the
// base-game spin that paid for it — as additional steps (RoundArtifact already supports this, see
// buildRoundArtifact's own multi-step support) — not as a second, separate, zero-stake outcome mixed into this
// library.
//
// The returned library is deeply frozen (see deepFreeze): each outcome's own RoundArtifact is already immutable
// by construction (see WeightedOutcome's own doc comment), so nothing here needs to deep-copy it. Outcomes are
// canonically sorted by id before freezing, so the exact same set of outcomes always produces the exact same
// library — and therefore the exact same hash and WeightedOutcomeLibraryAnalyzer output — no matter what order
// the caller happened to list them in.
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
    const artifactValidator: ValidationRule<RoundArtifact<T>> = options.artifactValidator ?? new RoundArtifactValidator<T>();

    const seenIds = new Set<string>();
    let reference: OutcomeHomogeneityKey | undefined;
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

        if (!Number.isFinite(input.artifact.stake) || input.artifact.stake <= 0) {
            throw new WeightedOutcomeLibraryBuildError(
                "weighted-outcome-stake-invalid",
                `outcome "${input.id}" has an invalid artifact.stake (${input.artifact.stake}); must be a finite number > 0.`,
            );
        }

        const artifactIssues = artifactValidator.validate(input.artifact);
        if (artifactIssues.length > 0) {
            throw new WeightedOutcomeLibraryBuildError(
                "weighted-outcome-artifact-invalid",
                `outcome "${input.id}" has an invalid artifact: ${artifactIssues.map((issue) => issue.code).join(", ")}.`,
            );
        }

        const current = homogeneityKeyOf(input.artifact);
        if (reference === undefined) {
            reference = current;
        } else {
            if (
                current.gameId !== reference.gameId ||
                current.gameVersion !== reference.gameVersion ||
                current.configHash !== reference.configHash ||
                current.pokieVersion !== reference.pokieVersion
            ) {
                throw new WeightedOutcomeLibraryBuildError(
                    "weighted-outcome-library-inconsistent-provenance",
                    `outcome "${input.id}" has different provenance (game id/version, configHash, or pokieVersion) than the library's other outcomes.`,
                );
            }
            if (current.betMode !== reference.betMode) {
                throw new WeightedOutcomeLibraryBuildError(
                    "weighted-outcome-library-inconsistent-bet-mode",
                    `outcome "${input.id}" has betMode "${current.betMode}", expected "${reference.betMode}" (the library's other outcomes' betMode).`,
                );
            }
            if (current.stake !== reference.stake) {
                throw new WeightedOutcomeLibraryBuildError(
                    "weighted-outcome-library-inconsistent-stake",
                    `outcome "${input.id}" has stake ${current.stake}, expected ${reference.stake} (the library's other outcomes' stake).`,
                );
            }
        }

        return {id: input.id, weight: input.weight, artifact: input.artifact};
    });

    outcomes.sort((a, b) => compareIds(a.id, b.id));

    const totalWeight = outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
    if (!Number.isFinite(totalWeight) || totalWeight <= 0) {
        throw new WeightedOutcomeLibraryBuildError(
            "weighted-outcome-library-total-weight-invalid",
            `the sum of all outcome weights must be a finite number > 0, got ${totalWeight}.`,
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
