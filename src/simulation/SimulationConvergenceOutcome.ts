// Machine-readable summary of how an opt-in convergence-enabled run's adaptive stop check behaved --
// echoed onto ParallelSimulationResult.convergence and, from there, SimulationReport.convergence.
// Absent whenever the run never enabled SimulationConvergenceOptions in the first place, same as every
// other additive-optional report field.
export type SimulationConvergenceOutcome = {
    minRounds: number;
    rtpTolerance: number;
    checkIntervalRounds: number;
    stableChecks: number;
    // Total number of convergence checks performed over the run. When workers > 1, convergence is
    // evaluated independently per worker share (see ParallelSimulationRunner's own doc comment), so
    // this is the sum across every worker that had a non-zero round share.
    checksPerformed: number;
    // How many consecutive checks were satisfying rtpTolerance/minRounds at the point the run stopped.
    // When workers > 1, the minimum across workers -- the weakest-converged worker.
    consecutiveStableChecks: number;
    // The RTP confidence interval half-width at the last check performed -- lower is more precise. When
    // workers > 1, the maximum across workers -- the least-precise worker's estimate.
    achievedRtpHalfWidth: number;
};
