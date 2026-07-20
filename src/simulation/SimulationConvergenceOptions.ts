// Opt-in adaptive early-stop criteria for a simulation run (see ParallelSimulationRunOptions.convergence)
// -- absent by default, so an existing caller/CLI invocation that never sets this is completely
// unaffected: the run always plays exactly `rounds` rounds, exactly as before this existed. Once set,
// `rounds`/`--rounds` becomes a maximum/ceiling a converging run can never exceed, not necessarily the
// number of rounds actually played.
export type SimulationConvergenceOptions = {
    // No convergence stop can trigger before this many rounds have been played, even if the RTP
    // estimate already happens to satisfy rtpTolerance early by chance -- guards against stopping on a
    // tiny, statistically meaningless sample.
    minRounds: number;
    // The run is considered converged once the running RTP's 95% confidence interval half-width (see
    // SimulationAccumulator.getStatistics().rtpConfidenceInterval95 -- never recomputed here, the
    // existing ConfidenceIntervalCalculator-based figure is reused as-is) is at or under this value, in
    // RTP units (e.g. 0.01 = the true RTP is estimated to within +/-1 percentage point).
    rtpTolerance: number;
    // How many rounds to play between convergence checks. Also becomes the run's effective chunk size
    // once convergence is enabled (a caller-supplied chunkSize is ignored in that case) -- a check can
    // only happen at a chunk boundary, since that's the only point an up-to-date running accumulator/
    // confidence interval is available.
    checkIntervalRounds: number;
    // How many consecutive checks must satisfy rtpTolerance (and minRounds), back to back, before the
    // run actually stops -- guards against stopping on a single lucky/noisy interval. A failing check
    // resets the count to zero. Defaults to 3.
    stableChecks?: number;
};
