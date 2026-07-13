// Thrown by ParallelSimulationRunner/SimulationWorkerCoordinator whenever any single worker fails
// (an explicit {type: "error"} message, an uncaught worker-thread exception, a malformed/unrecognized
// message, or a premature exit) — carries the failing worker's index and a safe, already-stringified
// reason (never a raw stack trace: a worker thread's Error.stack points at code the caller of `pokie
// sim`/Studio never sees and shouldn't have to reason about).
export class SimulationWorkerFailureError extends Error {
    public readonly workerIndex: number;

    constructor(workerIndex: number, reason: string) {
        super(`Worker ${workerIndex} failed: ${reason}`);
        this.name = "SimulationWorkerFailureError";
        this.workerIndex = workerIndex;
    }
}
