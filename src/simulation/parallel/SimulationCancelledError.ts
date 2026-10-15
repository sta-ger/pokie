// Thrown by ParallelSimulationRunner when an AbortSignal fires before/during a run — deliberately a
// distinct type from SimulationWorkerFailureError so callers (e.g. StudioSimulationService) can tell
// "the caller asked us to stop" apart from "a worker actually failed" and record the right terminal
// status (cancelled vs. failed) instead of treating every thrown error the same way.
export class SimulationCancelledError extends Error {
    /** Observed accepted prefix; never presented as a completed run or resumable worker. */
    public readonly observedPrefix?: import("../SimulationStatistics.js").SimulationStatistics;
    constructor(observedPrefix?: import("../SimulationStatistics.js").SimulationStatistics) {
        super("Simulation was cancelled.");
        this.observedPrefix = observedPrefix;
        this.name = "SimulationCancelledError";
    }
}
