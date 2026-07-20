import type {SpinOperationLeasing} from "./SpinOperationLeasing.js";
import type {SpinOperationLog} from "./SpinOperationLog.js";

// Feature-detected: true for a SpinOperationLog that additionally implements SpinOperationLeasing (e.g.
// InMemorySpinOperationLog), false for one that doesn't — see that interface's own doc comment for what
// this changes for SpinReconciliationService.
export function isSpinOperationLeasing(operationLog: SpinOperationLog): operationLog is SpinOperationLog & SpinOperationLeasing {
    const candidate = operationLog as Partial<SpinOperationLeasing>;
    return typeof candidate.tryClaimForReconciliation === "function" && typeof candidate.releaseReconciliationClaim === "function";
}
