import {SimulationAccumulator} from "./SimulationAccumulator.js";
import type {SimulationAccumulatorSnapshot} from "./SimulationAccumulatorSnapshot.js";
import type {SimulationBreakdownComponent} from "./SimulationBreakdownComponent.js";
import {mergeSimulationBreakdowns} from "./SimulationBreakdownMerging.js";
import type {SimulationStatistics} from "./SimulationStatistics.js";

export type SimulationStatisticsMergeEntry = {
    accumulator: SimulationAccumulatorSnapshot;
    // From AggregateSimulationRunner.getBreakdownStatistics() (per chunk/worker); undefined when that
    // particular chunk/worker never saw the optional categorization contract.
    breakdown?: Record<string, SimulationBreakdownComponent>;
};

export type SimulationStatisticsMergeResult = {
    statistics: SimulationStatistics;
    breakdown?: Record<string, SimulationBreakdownComponent>;
};

// Combines any number of SimulationAccumulator snapshots (one per worker thread, or one per internal
// progress-reporting chunk within a single worker — this class doesn't care which) into one final
// SimulationStatistics, plus a merged category breakdown if any entry had one. Used by
// ParallelSimulationRunner to fold every worker's SimulationWorkerResult into the final report, so
// there is exactly one place — this one — that combines partial results, rather than each caller
// reimplementing it.
//
// Deliberately reuses SimulationAccumulator.merge() (already a correct parallel/online mean+variance
// merge, see its own doc comment) rather than recomputing mean/variance from the merged totals —
// averaging N workers' variances directly would be wrong (see docs/simulation.md), and this class
// exists specifically so nothing ever does that.
export class SimulationStatisticsMerger {
    public merge(entries: SimulationStatisticsMergeEntry[]): SimulationStatisticsMergeResult {
        const accumulator = new SimulationAccumulator();
        let breakdown: Record<string, SimulationBreakdownComponent> | undefined;

        for (const entry of entries) {
            accumulator.merge(SimulationAccumulator.fromSnapshot(entry.accumulator));
            if (entry.breakdown) {
                breakdown = mergeSimulationBreakdowns(breakdown, entry.breakdown);
            }
        }

        return {statistics: accumulator.getStatistics(), breakdown};
    }
}
