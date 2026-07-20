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
    private lastAchievedRtpHalfWidth = Number.POSITIVE_INFINITY;

    constructor(options: SimulationConvergenceOptions) {
        this.options = options;
    }

    public check(accumulator: SimulationAccumulator, roundsCompleted: number): SimulationConvergenceCheckResult {
        this.checksPerformed++;
        const {low, high} = accumulator.getStatistics().rtpConfidenceInterval95;
        const halfWidth = (high - low) / 2;
        this.lastAchievedRtpHalfWidth = halfWidth;

        const satisfies = roundsCompleted >= this.options.minRounds && halfWidth <= this.options.rtpTolerance;
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
