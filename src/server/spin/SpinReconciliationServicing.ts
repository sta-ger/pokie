import type {SpinReconciliationOutcome} from "./SpinReconciliationOutcome.js";

export interface SpinReconciliationServicing {
    // Reconciles exactly one (sessionId, requestId)'s own SpinOperationRecord, if any. Called inline by
    // SpinCommandHandler.handleSerialized() right before it would otherwise run a fresh spin for a
    // requestId whose idempotency result is missing but whose operation record isn't terminal — see that
    // class's own doc comment.
    reconcileOne(sessionId: string, requestId: string): Promise<SpinReconciliationOutcome>;

    // Sweeps every currently-incomplete SpinOperationRecord (SpinOperationLog.listIncomplete()) and
    // reconciles each one — intended for an explicit startup/ops-triggered pass over whatever a durable
    // SpinOperationLog carried across a restart, rather than waiting for each one's own requestId to
    // happen to be retried.
    reconcileAll(): Promise<readonly SpinReconciliationOutcome[]>;
}
