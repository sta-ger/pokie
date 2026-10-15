import type {SimulationAccumulator} from "./SimulationAccumulator.js";
import type {SimulationConvergenceOptions} from "./SimulationConvergenceOptions.js";
import type {SimulationConvergenceOutcome} from "./SimulationConvergenceOutcome.js";

export type SimulationConvergenceCheckResult = {
    converged: boolean;
    consecutiveStableChecks: number;
    achievedRtpHalfWidth: number;
};

const DEFAULT_STABLE_CHECKS = 3;

// Evaluates SimulationConvergenceOptions against an already-computed SimulationAccumulator after every
// chunk boundary -- reads accumulator.getStatistics().rtpConfidenceInterval95 (itself built on the
// existing ConfidenceIntervalCalculator), never recomputes RTP/variance/confidence intervals itself, so
// no simulation math is duplicated here. Stateful only in the "how many consecutive checks passed"
// counter, so a fresh instance is needed per independent execution unit -- one per in-process run, one
// per worker when workers > 1 (see docs/simulation.md's convergence section for why checks are
// per-worker-share rather than globally coordinated across workers).
export class SimulationConvergenceChecker {
    private readonly options: SimulationConvergenceOptions;
    private consecutiveStableChecks = 0;
    private checksPerformed = 0;
    private lastAchievedRtpHalfWidth: number | null = null;

    constructor(options: SimulationConvergenceOptions) {
        this.options = options;
    }

    public check(accumulator: SimulationAccumulator, roundsCompleted: number): SimulationConvergenceCheckResult {
        this.checksPerformed++;
        const statistics = accumulator.getStatistics();
        const samples = statistics.logicalRoundMetrics ?? statistics;
        const {low, high} = samples.rtpConfidenceInterval95;
        const halfWidth = (high - low) / 2;
        this.lastAchievedRtpHalfWidth = halfWidth;

        // A losing prefix has no information about rare payouts even when its empirical variance is zero.
        // Configured positive-weight selections must be seen before adaptive stopping can claim precision.
        const uncovered = statistics.weightedBonus?.outcomes.some(o => o.weight > 0 && o.uncovered) ||
            statistics.reelSequences?.some(reel => reel.variants.some(v => v.weight > 0 && v.uncovered));
        const satisfies = samples.rounds >= 2 && samples.totalBet > 0 && samples.hitCount > 0 && !uncovered &&
            (statistics.logicalRoundMetrics ? samples.rounds : Math.min(samples.rounds, roundsCompleted)) >= this.options.minRounds &&
            Number.isFinite(halfWidth) && halfWidth <= this.options.rtpTolerance;
        this.consecutiveStableChecks = satisfies ? this.consecutiveStableChecks + 1 : 0;

        const requiredStableChecks = this.options.stableChecks ?? DEFAULT_STABLE_CHECKS;
        return {
            converged: this.consecutiveStableChecks >= requiredStableChecks,
            consecutiveStableChecks: this.consecutiveStableChecks,
            achievedRtpHalfWidth: halfWidth,
        };
    }

    public buildOutcome(): SimulationConvergenceOutcome {
        return {
            minRounds: this.options.minRounds,
            rtpTolerance: this.options.rtpTolerance,
            checkIntervalRounds: this.options.checkIntervalRounds,
            stableChecks: this.options.stableChecks ?? DEFAULT_STABLE_CHECKS,
            checksPerformed: this.checksPerformed,
            consecutiveStableChecks: this.consecutiveStableChecks,
            achievedRtpHalfWidth: this.lastAchievedRtpHalfWidth,
        };
    }
}
