import {deepFreeze} from "../internal/deepFreeze.js";
import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {PreGeneratedOutcomeSelection} from "./PreGeneratedOutcomeSelection.js";
import {PreGeneratedOutcomeSelectionValidator} from "./PreGeneratedOutcomeSelectionValidator.js";
import {PreGeneratedRoundBuildError} from "./PreGeneratedRoundBuildError.js";
import {PRE_GENERATED_ROUND_RESULT_SCHEMA_VERSION, type PreGeneratedRoundResult} from "./PreGeneratedRoundResult.js";
import type {PreGeneratedRoundRuntimeContext} from "./PreGeneratedRoundRuntimeContext.js";

export type PreGeneratedRoundBuildOptions<T extends string | number = string> = {
    // The identity the caller expects this selection to have come from — typically a session's own stamped
    // libraryId/libraryHash. Checked against `selection`'s own reported identity below rather than trusted
    // implicitly: a defensive backstop for any caller of this function, mirroring the identity check
    // PreGeneratedSpinCommandHandler itself already performs before ever reaching this point.
    expectedLibraryId: string;
    expectedLibraryHash: string;
    // Already drawn, atomically, from a PreGeneratedOutcomeSourcing implementation — carries its own
    // libraryId/libraryHash/totalWeight alongside the outcome itself, so this function never needs a full
    // WeightedOutcomeLibrary to build a result from it.
    selection: PreGeneratedOutcomeSelection<T>;
    runtime: PreGeneratedRoundRuntimeContext;
};

// The one place a PreGeneratedRoundResult is assembled — always from a PreGeneratedOutcomeSelection already
// produced by a PreGeneratedOutcomeSourcing implementation (InMemoryPreGeneratedOutcomeSource,
// OutcomeLibraryBundleOutcomeSource, or reproduced by PreGeneratedRoundReplayer), never a second calculation
// path. `selection.outcome.artifact` is referenced directly (already deeply frozen/immutable by
// buildRoundArtifact/buildWeightedOutcomeLibrary), never copied or mutated.
//
// Fails fast with PreGeneratedRoundBuildError — before any result is ever returned — on: a `selection` whose
// own libraryId/libraryHash doesn't match the caller's expected identity, a `selection` that fails
// PreGeneratedOutcomeSelectionValidator (non-empty libraryId/outcome.id, valid-format libraryHash, positive-safe-
// integer weight/totalWeight, weight <= totalWeight, or an artifact that fails RoundArtifactValidator — the same
// check PreGeneratedSpinCommandHandler itself already runs immediately after drawing, redundant here on purpose
// as a defensive backstop for any other caller of this function), an invalid runtime.roundId/sessionId, a
// non-finite runtime.balanceBefore/balanceAfter, a malformed runtime.transactions entry, or content that isn't
// JSON-safe. There is no longer a "the outcome must be the library's own array element" reference-identity check
// — without a full library there's no array to check against — but that guarantee now comes structurally from
// PreGeneratedOutcomeSourcing itself: the only way to obtain a PreGeneratedOutcomeSelection at all is a real
// source's own drawOutcome(), which always produces a genuine, already-verified outcome
// (WeightedOutcomeSelector.select for the in-memory adapter, readAndVerifyOutcomeAtByteRange for the bundle
// adapter).
export function buildPreGeneratedRoundResult<T extends string | number = string>(
    options: PreGeneratedRoundBuildOptions<T>,
): PreGeneratedRoundResult<T> {
    const {expectedLibraryId, expectedLibraryHash, selection, runtime} = options;

    if (selection.libraryId !== expectedLibraryId || selection.libraryHash !== expectedLibraryHash) {
        throw new PreGeneratedRoundBuildError(
            "pre-generated-round-source-identity-mismatch",
            `selection was drawn against libraryId "${selection.libraryId}"/hash "${selection.libraryHash}", but ` +
                `expected libraryId "${expectedLibraryId}"/hash "${expectedLibraryHash}".`,
        );
    }

    const selectionIssues = new PreGeneratedOutcomeSelectionValidator<T>().validate(selection);
    if (selectionIssues.length > 0) {
        throw new PreGeneratedRoundBuildError(
            "pre-generated-round-selection-invalid",
            `selection failed validation: ${selectionIssues.map((issue) => issue.code).join(", ")}.`,
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

    const candidate: PreGeneratedRoundResult<T> = {
        schemaVersion: PRE_GENERATED_ROUND_RESULT_SCHEMA_VERSION,
        selection: {
            libraryId: selection.libraryId,
            libraryHash: selection.libraryHash,
            outcomeId: selection.outcome.id,
            weight: selection.outcome.weight,
            totalWeight: selection.totalWeight,
            probability: selection.outcome.weight / selection.totalWeight,
        },
        runtime: {
            roundId: runtime.roundId,
            sessionId: runtime.sessionId,
            ...(runtime.requestId !== undefined ? {requestId: runtime.requestId} : {}),
            balanceBefore: runtime.balanceBefore,
            balanceAfter: runtime.balanceAfter,
            transactions: runtime.transactions.map((transaction) => ({...transaction})),
        },
        artifact: selection.outcome.artifact,
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
