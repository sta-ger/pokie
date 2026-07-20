import type {SpinCommandResult} from "./SpinCommandResult.js";
import type {SpinOperationRecord} from "./SpinOperationRecord.js";

// What SpinReconciliationService.reconcileOne()/reconcileAll() reports for one requestId-bearing attempt.
// Every case carries a human-readable "reason" for audit/diagnostics — never just a bare status code — so
// a caller (or an operator reading a reconcileAll() sweep's output) can see exactly why a given
// classification was reached without re-deriving it from the raw SpinOperationRecord themselves.
export type SpinReconciliationOutcome =
    // No SpinOperationRecord existed for this (sessionId, requestId) at all, it was already at the
    // "compensated" checkpoint (a same-process compensation already fully restored wallet/session), or
    // wallet inspection confirmed neither the debit nor the win settlement is currently applied for a
    // "started"/"debited" record — in every case nothing is currently left applied, so there is nothing
    // to reverse, resume, or flag. Never inferred from the checkpoint value alone for "started"/"debited"
    // — see SpinReconciliationService's own doc comment on why that checkpoint doesn't prove the debit
    // never happened.
    | {status: "no-action-needed"; sessionId: string; requestId: string; reason: string}
    // The record had already reached "committed" and IdempotencyRepository was directly re-verified to
    // still hold its result — the attempt is genuinely fully done.
    | {status: "already-committed"; sessionId: string; requestId: string; reason: string}
    // The stake debit was confirmed applied but the matching win settlement was confirmed NOT applied
    // (via WalletTransactionInspecting) — the debit was reversed, and wallet/session are back to a clean
    // pre-attempt state. A caller should proceed to run a genuinely fresh spin for this requestId.
    | {status: "reversed"; sessionId: string; requestId: string; reason: string}
    // Either the win settlement (both wallet legs) was confirmed applied and the record's own
    // capturedResult carried enough to finish the attempt without ever calling session.play() again (the
    // session state, if not already persisted, and the idempotency result were written from that
    // captured data), or the record had already reached "committed" and idempotencyRepository was found
    // missing its result, backfilled the same way. "result" is exactly what a caller should return,
    // precisely as if the original attempt itself had completed normally.
    | {status: "resumed"; sessionId: string; requestId: string; reason: string; result: SpinCommandResult}
    // The record's own checkpoint was updated too recently to safely assume it's abandoned rather than
    // still actively progressing (see SpinReconciliationService's own quiescence window) — deliberately
    // not acted on to avoid racing a live attempt. Retry later; never treated as "safe to proceed."
    | {status: "deferred"; sessionId: string; requestId: string; reason: string}
    // The record is genuinely ambiguous — the checkpoint and the wallet's own (or idempotencyRepository's
    // own) reality disagree in a way that can't be safely resolved automatically (e.g. no
    // WalletTransactionInspecting to check with, a SessionVersionConflictError while trying to resume, or
    // a "committed" record with no captured data left to rebuild a missing idempotency result from).
    // Never guessed at; "record" is the full SpinOperationRecord so an operator/tool has everything
    // needed to resolve it by hand.
    | {status: "manual-recovery-required"; sessionId: string; requestId: string; reason: string; record: SpinOperationRecord};
