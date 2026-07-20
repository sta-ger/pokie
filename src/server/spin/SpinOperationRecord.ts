import type {PokieSessionState} from "../session/PokieSessionState.js";
import type {SpinOperationCheckpoint} from "./SpinOperationCheckpoint.js";

// What playAndSettle() already computed by the time the wallet settlement (win credit/debit-delta)
// succeeds — captured into the SpinOperationRecord from the "settled" checkpoint onward so
// SpinReconciliationService can resume a stuck attempt (persist the session state, persist the
// idempotency result) using data already known to be correct, rather than ever calling session.play()
// a second time to recompute it. Mirrors the "played" SpinCommandResult's own fields exactly, minus
// requestId (the record is already keyed by it).
export type SpinOperationCapturedResult = {
    readonly previousState: PokieSessionState;
    readonly newState: PokieSessionState;
    readonly win: number;
    readonly credits: number;
    readonly newVersion?: number;
};

// One requestId-bearing spin attempt's own progress, keyed by (sessionId, requestId). "attemptId" and
// the transaction ids mirror playAndSettle()'s own minting scheme exactly (see SpinCommandHandler's own
// doc comment) — recorded here so a reconciliation pass can name exactly which wallet transaction it's
// reasoning about without recomputing anything.
export type SpinOperationRecord = {
    readonly sessionId: string;
    readonly requestId: string;
    readonly attemptId: string;
    readonly debitTransactionId: string;
    readonly creditTransactionId: string;
    readonly stakeAmount: number;
    // The SessionRepository version this attempt loaded at — undefined when the repository isn't
    // versioned. Used by SpinReconciliationService to resume via saveVersioned() with the same
    // precondition the original attempt itself would have used.
    readonly expectedVersion: number | undefined;
    readonly checkpoint: SpinOperationCheckpoint;
    readonly startedAt: string;
    readonly updatedAt: string;
    // Present only once the checkpoint has reached "settled" or later — see SpinOperationCapturedResult.
    readonly capturedResult?: SpinOperationCapturedResult;
};
