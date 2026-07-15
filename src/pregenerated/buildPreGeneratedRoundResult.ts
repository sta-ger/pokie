import {deepFreeze} from "../internal/deepFreeze.js";
import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import {computeWeightedOutcomeLibraryHash} from "../weightedoutcome/computeWeightedOutcomeLibraryHash.js";
import type {WeightedOutcome} from "../weightedoutcome/WeightedOutcome.js";
import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";
import {isPositiveSafeInteger} from "./internal/isPositiveSafeInteger.js";
import {PreGeneratedRoundBuildError} from "./PreGeneratedRoundBuildError.js";
import {PRE_GENERATED_ROUND_RESULT_SCHEMA_VERSION, type PreGeneratedRoundResult} from "./PreGeneratedRoundResult.js";
import type {PreGeneratedRoundRuntimeContext} from "./PreGeneratedRoundRuntimeContext.js";

export type PreGeneratedRoundBuildOptions<T extends string | number = string> = {
    library: WeightedOutcomeLibrary<T>;
    // The caller's claimed hash for `library` — verified against computeWeightedOutcomeLibraryHash(library)
    // below rather than trusted as-is, so a stale or forged libraryHash (e.g. left over from a library that
    // was since regenerated with different weights under the same libraryId) is rejected rather than
    // silently stamped onto this result's provenance.
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
// Fails fast with PreGeneratedRoundBuildError — before any result is ever returned — on: an `outcome`
// that isn't the library's own object for that id (strict reference identity on the *whole* outcome,
// not just its artifact — catches a forged weight riding along a genuine artifact reference, not only a
// wholesale swap), a `libraryHash` that doesn't match the library's actual, freshly recomputed hash, an
// invalid runtime.roundId/sessionId, a non-finite runtime.balanceBefore/balanceAfter, a malformed
// runtime.transactions entry, a non-positive-safe-integer outcome.weight/library total weight (stricter
// than WeightedOutcomeLibrary itself requires — see WeightedOutcomeSelector's own doc comment for why a
// library meant to be *drawn from* needs integer weights), or content that isn't JSON-safe.
export function buildPreGeneratedRoundResult<T extends string | number = string>(
    options: PreGeneratedRoundBuildOptions<T>,
): PreGeneratedRoundResult<T> {
    const {library, libraryHash, outcome, runtime} = options;

    const matched = library.outcomes.find((candidate) => candidate.id === outcome.id);
    if (matched === undefined || matched !== outcome) {
        throw new PreGeneratedRoundBuildError(
            "pre-generated-round-outcome-not-in-library",
            `Outcome "${outcome.id}" is not present in library "${library.libraryId}".`,
        );
    }

    const actualLibraryHash = computeWeightedOutcomeLibraryHash(library);
    if (libraryHash !== actualLibraryHash) {
        throw new PreGeneratedRoundBuildError(
            "pre-generated-round-library-hash-mismatch",
            `libraryHash "${libraryHash}" does not match library "${library.libraryId}"'s actual hash "${actualLibraryHash}".`,
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

    if (!isPositiveSafeInteger(outcome.weight)) {
        throw new PreGeneratedRoundBuildError(
            "pre-generated-round-selection-weight-invalid",
            `outcome.weight must be a positive safe integer, got ${outcome.weight}.`,
        );
    }

    const totalWeight = library.outcomes.reduce((sum, candidate) => sum + candidate.weight, 0);
    if (!isPositiveSafeInteger(totalWeight)) {
        throw new PreGeneratedRoundBuildError(
            "pre-generated-round-selection-total-weight-invalid",
            `library "${library.libraryId}"'s total weight must be a positive safe integer, got ${totalWeight}.`,
        );
    }

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
