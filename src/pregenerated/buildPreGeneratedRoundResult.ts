import {deepFreeze} from "../internal/deepFreeze.js";
import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {WeightedOutcome} from "../weightedoutcome/WeightedOutcome.js";
import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";
import {PreGeneratedRoundBuildError} from "./PreGeneratedRoundBuildError.js";
import {PRE_GENERATED_ROUND_RESULT_SCHEMA_VERSION, type PreGeneratedRoundResult} from "./PreGeneratedRoundResult.js";
import type {PreGeneratedRoundRuntimeContext} from "./PreGeneratedRoundRuntimeContext.js";

export type PreGeneratedRoundBuildOptions<T extends string | number = string> = {
    library: WeightedOutcomeLibrary<T>;
    // Precomputed rather than recomputed here: hashing a library is a whole-library canonical-JSON
    // pass, wasteful to repeat on every round a caller serves from the same, unchanging library — see
    // computeWeightedOutcomeLibraryHash, meant to be called once when a library is loaded/configured.
    libraryHash: string;
    outcome: WeightedOutcome<T>;
    runtime: PreGeneratedRoundRuntimeContext;
};

// The one place a PreGeneratedRoundResult is assembled — always from an outcome already selected by
// WeightedOutcomeSelector (or reproduced by PreGeneratedRoundReplayer) against an already-built
// WeightedOutcomeLibrary, never a second calculation path. `outcome.artifact` is referenced directly
// (already deeply frozen/immutable by buildRoundArtifact/buildWeightedOutcomeLibrary), never copied or
// mutated — the canonical library content this result was drawn from stays exactly as it was.
//
// Fails fast with PreGeneratedRoundBuildError — before any result is ever returned — on: an outcome
// that isn't actually present in `library` (by id and by artifact identity — catches a caller passing
// an outcome drawn from a different library instance under the same id), an invalid
// runtime.roundId/sessionId, a non-finite runtime.balanceBefore/balanceAfter, a malformed
// runtime.transactions entry, or content that isn't JSON-safe.
export function buildPreGeneratedRoundResult<T extends string | number = string>(
    options: PreGeneratedRoundBuildOptions<T>,
): PreGeneratedRoundResult<T> {
    const {library, libraryHash, outcome, runtime} = options;

    const matched = library.outcomes.find((candidate) => candidate.id === outcome.id);
    if (matched === undefined || matched.artifact !== outcome.artifact) {
        throw new PreGeneratedRoundBuildError(
            "pre-generated-round-outcome-not-in-library",
            `Outcome "${outcome.id}" is not present in library "${library.libraryId}".`,
        );
    }

    if (typeof runtime.roundId !== "string" || runtime.roundId.trim().length === 0) {
        throw new PreGeneratedRoundBuildError(
            "pre-generated-round-round-id-invalid",
            `runtime.roundId must be a non-empty string, got ${JSON.stringify(runtime.roundId)}.`,
        );
    }
    if (typeof runtime.sessionId !== "string" || runtime.sessionId.trim().length === 0) {
        throw new PreGeneratedRoundBuildError(
            "pre-generated-round-session-id-invalid",
            `runtime.sessionId must be a non-empty string, got ${JSON.stringify(runtime.sessionId)}.`,
        );
    }
    if (runtime.requestId !== undefined && (typeof runtime.requestId !== "string" || runtime.requestId.trim().length === 0)) {
        throw new PreGeneratedRoundBuildError(
            "pre-generated-round-request-id-invalid",
            `runtime.requestId must be a non-empty string when given, got ${JSON.stringify(runtime.requestId)}.`,
        );
    }
    if (!Number.isFinite(runtime.balanceBefore)) {
        throw new PreGeneratedRoundBuildError(
            "pre-generated-round-balance-before-invalid",
            `runtime.balanceBefore must be a finite number, got ${runtime.balanceBefore}.`,
        );
    }
    if (!Number.isFinite(runtime.balanceAfter)) {
        throw new PreGeneratedRoundBuildError(
            "pre-generated-round-balance-after-invalid",
            `runtime.balanceAfter must be a finite number, got ${runtime.balanceAfter}.`,
        );
    }
    runtime.transactions.forEach((transaction, index) => {
        if (typeof transaction.id !== "string" || transaction.id.trim().length === 0) {
            throw new PreGeneratedRoundBuildError(
                "pre-generated-round-transaction-id-invalid",
                `runtime.transactions[${index}] has an invalid id, got ${JSON.stringify(transaction.id)}.`,
            );
        }
        if (transaction.type !== "debit" && transaction.type !== "credit") {
            throw new PreGeneratedRoundBuildError(
                "pre-generated-round-transaction-type-invalid",
                `runtime.transactions[${index}] has an invalid type, got ${JSON.stringify(transaction.type)}.`,
            );
        }
        if (!Number.isFinite(transaction.amount) || transaction.amount < 0) {
            throw new PreGeneratedRoundBuildError(
                "pre-generated-round-transaction-amount-invalid",
                `runtime.transactions[${index}] has an invalid amount (${transaction.amount}); must be a finite number >= 0.`,
            );
        }
    });

    const totalWeight = library.outcomes.reduce((sum, candidate) => sum + candidate.weight, 0);

    const candidate: PreGeneratedRoundResult<T> = {
        schemaVersion: PRE_GENERATED_ROUND_RESULT_SCHEMA_VERSION,
        selection: {
            libraryId: library.libraryId,
            libraryHash,
            outcomeId: outcome.id,
            weight: outcome.weight,
            totalWeight,
            probability: outcome.weight / totalWeight,
        },
        runtime: {
            roundId: runtime.roundId,
            sessionId: runtime.sessionId,
            ...(runtime.requestId !== undefined ? {requestId: runtime.requestId} : {}),
            balanceBefore: runtime.balanceBefore,
            balanceAfter: runtime.balanceAfter,
            transactions: runtime.transactions.map((transaction) => ({...transaction})),
        },
        artifact: outcome.artifact,
    };

    try {
        toCanonicalJson(candidate);
    } catch (error) {
        const reason = error instanceof InvalidJsonValueError ? error.message : String(error);
        throw new PreGeneratedRoundBuildError(
            "pre-generated-round-not-json-safe",
            `Built PreGeneratedRoundResult is not JSON-safe: ${reason}`,
        );
    }

    // deepFreeze no-ops on anything already frozen (see its own doc comment) — `artifact` stays the
    // exact library reference, never re-copied; only the newly built wrapper (selection/runtime) is
    // actually frozen here.
    return deepFreeze(candidate);
}
