import type {ModifierStatistics} from "./ModifierStatistics.js";
import type {ReelSequenceStatistics} from "../session/videoslot/combinations/WeightedSequenceVariant.js";
import type {LogicalRoundStatistics} from "./LogicalRoundStatistics.js";
// Plain-data mirror of SimulationAccumulator's private running-totals state (see its toSnapshot()/
// fromSnapshot()) — the one thing that's safe to pass across a worker_threads boundary (a live
// SimulationAccumulator instance is not structured-cloneable in a meaningful way; this is). Exists
// purely so a merge step (see SimulationStatisticsMerger) can reconstruct a real SimulationAccumulator
// and reuse its own merge() — the online mean/variance algorithm itself is never duplicated.
export type SimulationAccumulatorSnapshot = {
    modifiers?: ModifierStatistics;
    reelSequences?: ReelSequenceStatistics[];
    logicalRounds?: LogicalRoundStatistics;
    rounds: number;
    hitCount: number;
    totalBet: number;
    totalPayout: number;
    maxWin: number;
    maxWinCount?: number;
    meanPayout: number;
    meanSquareDelta: number;
    meanReturnRatio: number;
    meanReturnRatioSquareDelta: number;
    // Added with the actual-stake accounting contract. Optional only so an
    // older persisted worker snapshot can still be read; newly produced
    // snapshots always include the complete ratio-estimator state.
    meanBet?: number;
    betSquareDelta?: number;
    payoutBetCoMoment?: number;
    payoutHistogram: Record<string, number>;
};
