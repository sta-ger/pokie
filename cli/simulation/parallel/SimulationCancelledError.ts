// Thrown by ParallelSimulationRunner when an AbortSignal fires before/during a run — deliberately a
// distinct type from SimulationWorkerFailureError so callers (e.g. StudioSimulationService) can tell
// "the caller asked us to stop" apart from "a worker actually failed" and record the right terminal
// status (cancelled vs. failed) instead of treating every thrown error the same way.
export class SimulationCancelledError extends Error {
    constructor() {
        super("Simulation was cancelled.");
        this.name = "SimulationCancelledError";
    }
}
