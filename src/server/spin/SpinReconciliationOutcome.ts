import type {SpinCommandResult} from "./SpinCommandResult.js";
import type {SpinOperationRecord} from "./SpinOperationRecord.js";

// What SpinReconciliationService.reconcileOne()/reconcileAll() reports for one requestId-bearing attempt.
// Every case carries a human-readable "reason" for audit/diagnostics — never just a bare status code — so
// a caller (or an operator reading a reconcileAll() sweep's output) can see exactly why a given
// classification was reached without re-deriving it from the raw SpinOperationRecord themselves.
export type SpinReconciliationOutcome =
    // No SpinOperationRecord existed for this (sessionId, requestId) at all, or it was already at the
    // "started"/"compensated" checkpoint — in both cases nothing was ever left applied, so there is
    // nothing to reverse, resume, or flag.
    | {status: "no-action-needed"; sessionId: string; requestId: string; reason: string}
    // The record had already reached "committed" — the attempt is fully done; IdempotencyRepository
    // already holds its result.
    | {status: "already-committed"; sessionId: string; requestId: string; reason: string}
    // The stake debit was confirmed applied but the matching win settlement was confirmed NOT applied
    // (via WalletTransactionInspecting) — the debit was reversed, and wallet/session are back to a clean
    // pre-attempt state. A caller should proceed to run a genuinely fresh spin for this requestId.
    | {status: "reversed"; sessionId: string; requestId: string; reason: string}
    // The win settlement (both wallet legs) was already confirmed applied, and the record's own
    // capturedResult carried enough to finish the attempt without ever calling session.play() again —
    // the session state (if not already persisted) and the idempotency result were written from that
    // captured data. "result" is exactly what a caller should return, precisely as if the original
    // attempt itself had completed normally.
    | {status: "resumed"; sessionId: string; requestId: string; reason: string; result: SpinCommandResult}
    // The record is genuinely ambiguous — the checkpoint and the wallet's own reality disagree in a way
    // that can't be safely resolved automatically (e.g. no WalletTransactionInspecting to check with, or
    // a SessionVersionConflictError while trying to resume). Never guessed at; "record" is the full
    // SpinOperationRecord so an operator/tool has everything needed to resolve it by hand.
    | {status: "manual-recovery-required"; sessionId: string; requestId: string; reason: string; record: SpinOperationRecord};
