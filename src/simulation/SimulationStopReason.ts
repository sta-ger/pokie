// Why a simulation run ended where it did. "maxRounds" is the only possibility for the pre-existing
// fixed-round path (every requested round was played); "sessionStopped" is the pre-existing
// canPlayNextGame()/play-strategy early stop; "converged" only happens when the caller opted into
// SimulationConvergenceOptions and the adaptive stop check was satisfied. Public (unlike the internal
// worker_threads transport types) because it's part of ParallelSimulationResult/SimulationReport.
export type SimulationStopReason = "maxRounds" | "sessionStopped" | "converged";
