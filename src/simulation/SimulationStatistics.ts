import type {ModifierStatistics} from "./ModifierStatistics.js";
import type {ReelSequenceStatistics} from "../session/videoslot/combinations/WeightedSequenceVariant.js";
import type {LogicalRoundStatistics} from "./LogicalRoundStatistics.js";
export type SimulationStatistics = {
    modifiers?: ModifierStatistics;
    reelSequences?: ReelSequenceStatistics[];
    logicalRounds?: LogicalRoundStatistics;
    logicalRoundMetrics?: SimulationStatistics;
    rounds: number;
    hitCount: number;
    totalBet: number;
    totalPayout: number;
    averageBet: number;
    averagePayout: number;
    averagePayoutConfidenceInterval95: {low: number; high: number};
    rtp: number;
    rtpConfidenceInterval95: {low: number; high: number};
    volatility: number;
    payoutStandardDeviation: number;
    returnStandardDeviation: number;
    maxWin: number;
    /** Frequency of the exact largest positive payout, never a histogram bucket proxy. */
    maxWinFrequency?: number;
    payoutHistogram: Record<string, number>;
};
