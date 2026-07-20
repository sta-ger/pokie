import type {SpinOperationRecord} from "./SpinOperationRecord.js";

// Durable-if-you-provide-it record of every requestId-bearing spin attempt's own progress — the
// mechanism SpinCommandHandler/SpinReconciliationService use to tell "safely retryable," "already
// committed," and "needs manual recovery" apart after a process crash (or a same-process compensation
// failure), per SpinOperationCheckpoint's own doc comment. Scoped to requestId-bearing attempts only, the
// same scope IdempotencyRepository already has — a requestId-less call has no logical identity to
// reconcile against, so nothing here is ever consulted or written for one.
//
// Additive to the existing SessionRepository/WalletPort/IdempotencyRepository ports: a caller that never
// supplies one gets InMemorySpinOperationLog (see SpinCommandHandler's own constructor default), which
// carries the exact same "lost on a crash/restart" tradeoff InMemoryWallet/InMemoryIdempotencyRepository
// already have — a deployment that actually needs this mechanism to survive a crash (e.g. one already
// pairing FileSessionRepository with a durable wallet/idempotency store) is responsible for providing a
// durable implementation of this interface itself, the same responsibility SpinCommandHandler's own doc
// comment already places on wallet/idempotency durability.
export interface SpinOperationLog {
    // Upserts by (record.sessionId, record.requestId) — a later record() call for the same pair replaces
    // whatever was stored before, moving it forward (or, on the "compensated" terminal write, closing
    // it out) rather than accumulating a history.
    record(record: SpinOperationRecord): Promise<void>;

    load(sessionId: string, requestId: string): Promise<SpinOperationRecord | undefined>;

    // Removes a resolved record entirely. Not required by SpinCommandHandler's own reconciliation flow
    // (a terminal checkpoint left in place is itself the audit trail — see SpinOperationCheckpoint), but
    // available for a caller that wants to prune resolved records on its own retention schedule.
    delete(sessionId: string, requestId: string): Promise<void>;

    // Every record whose checkpoint is not yet terminal ("committed"/"compensated") — what
    // SpinReconciliationService.reconcileAll() sweeps, e.g. at server startup.
    listIncomplete(): Promise<readonly SpinOperationRecord[]>;
}
