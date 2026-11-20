import type {RoundRecord} from "../roundrecord/RoundRecord.js";
import {RoundRecordValidator} from "../roundrecord/RoundRecordValidator.js";
import {deepFreeze} from "../internal/deepFreeze.js";
import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {ValidationRule} from "../validation/ValidationRule.js";
import {compareIds} from "./internal/compareIds.js";
import {WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION, type WeightedOutcomeLibrary} from "./WeightedOutcomeLibrary.js";
import {WeightedOutcomeLibraryBuildError} from "./WeightedOutcomeLibraryBuildError.js";
import type {WeightedOutcome} from "./WeightedOutcome.js";

export type WeightedOutcomeInput<T extends string | number = string> = {
    id: string;
    weight: number;
    record: RoundRecord<T>;
};

export type WeightedOutcomeLibraryBuildOptions<T extends string | number = string> = {
    libraryId: string;
    outcomes: readonly WeightedOutcomeInput<T>[];
    schemaVersion?: number;
    // A real RoundRecordValidator always runs against every outcome's record, regardless of this option —
    // this is only ever an *additional* check, never a replacement for it (so a permissive custom validator can
    // never let a malformed RoundRecord through). Use it to layer on extra, library- or game-specific
    // invariants beyond what RoundRecordValidator already covers.
    recordValidator?: ValidationRule<RoundRecord<T>>;
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

function homogeneityKeyOf<T extends string | number>(record: RoundRecord<T>): OutcomeHomogeneityKey {
    return {
        gameId: record.origin.game.id,
        gameVersion: record.origin.game.version,
        configHash: record.origin.configHash,
        pokieVersion: record.origin.pokieVersion,
        betMode: record.betMode,
        stake: record.stake,
    };
}

// The one place a WeightedOutcomeLibrary is assembled — always from already-built RoundRecords, never a
// second calculation path. Fails fast with WeightedOutcomeLibraryBuildError — before any library is ever
// returned — on: an invalid libraryId/schemaVersion, an empty outcomes list, an invalid or duplicate outcome
// id, an invalid (non-finite or <= 0) weight or record.payoutMultiplier, an invalid (non-finite or <= 0)
// record.stake, an record that fails RoundRecordValidator (always run — see "record validation" below),
// a total weight that isn't a finite number > 0 (covers both "sums to zero" and "the sum of otherwise-finite
// weights overflows to Infinity"), content that isn't JSON-safe, or a library whose outcomes don't all share
// the same game id/version/configHash/pokieVersion/betMode/stake.
//
// A weight of exactly 0 is rejected, not just a negative one: a zero-weight outcome can never actually occur
// (by definition) and contributes nothing to any statistic, so admitting it would only let a caller believe a
// jackpot (or any other outcome) is "in" the library's analysis when it can never actually be drawn.
//
// Record validation — RoundRecordValidator always runs against every outcome's record, whether or not an
// `recordValidator` option is given; that option can only ever add further checks on top; a permissive custom
// validator (e.g. one that always returns no issues) can never let a malformed RoundRecord through.
//
// That last check — "library homogeneity" — exists because a WeightedOutcomeLibrary models the distribution of
// results for one specific paid bet (see docs/weighted-outcome-library.md): every outcome's record.stake must
// therefore be the same positive amount, not a mix of a real stake and a `0` for a free-games round captured as
// its own outcome. A free-games (or any other multi-step) round belongs inside the *same* RoundRecord as the
// base-game spin that paid for it — as additional steps (RoundRecord already supports this, see
// buildRoundRecord's own multi-step support) — not as a second, separate, zero-stake outcome mixed into this
// library.
//
// The returned library is deeply frozen (see deepFreeze): each outcome's own RoundRecord is already immutable
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
    const roundRecordValidator = new RoundRecordValidator<T>();
    const extraRecordValidator: ValidationRule<RoundRecord<T>> | undefined = options.recordValidator;

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

        if (!Number.isFinite(input.weight) || input.weight <= 0) {
            throw new WeightedOutcomeLibraryBuildError(
                "weighted-outcome-weight-invalid",
                `outcome "${input.id}" has an invalid weight (${input.weight}); must be a finite number > 0.`,
            );
        }

        if (!Number.isFinite(input.record.payoutMultiplier) || input.record.payoutMultiplier < 0) {
            throw new WeightedOutcomeLibraryBuildError(
                "weighted-outcome-payout-multiplier-invalid",
                `outcome "${input.id}" has an invalid record.payoutMultiplier (${input.record.payoutMultiplier}); must be a finite number >= 0.`,
            );
        }

        if (!Number.isFinite(input.record.stake) || input.record.stake <= 0) {
            throw new WeightedOutcomeLibraryBuildError(
                "weighted-outcome-stake-invalid",
                `outcome "${input.id}" has an invalid record.stake (${input.record.stake}); must be a finite number > 0.`,
            );
        }

        const recordIssues = [
            ...roundRecordValidator.validate(input.record),
            ...(extraRecordValidator?.validate(input.record) ?? []),
        ];
        if (recordIssues.length > 0) {
            throw new WeightedOutcomeLibraryBuildError(
                "weighted-outcome-record-invalid",
                `outcome "${input.id}" has an invalid record: ${recordIssues.map((issue) => issue.code).join(", ")}.`,
            );
        }

        const current = homogeneityKeyOf(input.record);
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

        return {id: input.id, weight: input.weight, record: input.record};
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
