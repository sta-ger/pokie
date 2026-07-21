import type {JackpotPoolStatisticsSnapshot, JackpotStatisticsSnapshot} from "../session/JackpotStatisticsSnapshot.js";

// Combines one additional worker's jackpot statistics snapshot into a running total — mirrors
// mergeSimulationBreakdowns' own role/shape exactly (see that file's own doc comment), the one place this
// arithmetic lives. Unlike mergeSimulationBreakdowns, this is ONLY ever safe to use across genuinely
// independent sessions (e.g. one per parallel worker) — never across chunks of the *same* session's own
// simulation run, since JackpotStatisticsSnapshot is already cumulative for whatever session produced it
// (see JackpotStatisticsProviding's own doc comment): merging two cumulative snapshots from the *same*
// session's own successive chunks would double-count every round already reflected in the earlier one. See
// AggregateSimulationRunner.getJackpotStatistics() (a single read after the run, never merged internally)
// and runChunkedSimulation (a single read after its own chunk loop finishes, also never merged internally)
// for the correct within-one-session handling; this function is reserved for ParallelSimulationRunner's own
// cross-worker combination, via SimulationStatisticsMerger.
export function mergeJackpotStatisticsSnapshots(
    base: JackpotStatisticsSnapshot | undefined,
    addition: JackpotStatisticsSnapshot,
): JackpotStatisticsSnapshot {
    if (base === undefined) {
        return addition;
    }
    const pools: Record<string, JackpotPoolStatisticsSnapshot> = {...base.pools};
    for (const [poolId, stats] of Object.entries(addition.pools)) {
        const existing = pools[poolId];
        pools[poolId] = existing === undefined ? stats : mergePoolStatistics(existing, stats);
    }
    return {
        awardCount: base.awardCount + addition.awardCount,
        totalAwarded: base.totalAwarded + addition.totalAwarded,
        totalContributed: base.totalContributed + addition.totalContributed,
        pools,
    };
}

function mergePoolStatistics(a: JackpotPoolStatisticsSnapshot, b: JackpotPoolStatisticsSnapshot): JackpotPoolStatisticsSnapshot {
    return {
        awardCount: a.awardCount + b.awardCount,
        totalAwarded: a.totalAwarded + b.totalAwarded,
        totalContributed: a.totalContributed + b.totalContributed,
    };
}
