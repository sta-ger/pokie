import type {JackpotPoolStatisticsSnapshot} from "../../JackpotStatisticsSnapshot.js";

// Returns a new pool-statistics map with "poolId"'s own entry incremented by "delta" (defaulting any
// missing fields/entry to 0 first) — never mutates "current". The one place JackpotRoundHandler computes an
// updated map before calling session.setJackpotPoolStatistics() (see that interface's own doc comment on
// why it's whole-map replacement, not a fine-grained per-pool setter).
export function applyJackpotPoolStatisticsDelta(
    current: Readonly<Record<string, JackpotPoolStatisticsSnapshot>>,
    poolId: string,
    delta: Partial<JackpotPoolStatisticsSnapshot>,
): Readonly<Record<string, JackpotPoolStatisticsSnapshot>> {
    const existing: JackpotPoolStatisticsSnapshot = current[poolId] ?? {awardCount: 0, totalAwarded: 0, totalContributed: 0};
    return {
        ...current,
        [poolId]: {
            awardCount: existing.awardCount + (delta.awardCount ?? 0),
            totalAwarded: existing.totalAwarded + (delta.totalAwarded ?? 0),
            totalContributed: existing.totalContributed + (delta.totalContributed ?? 0),
        },
    };
}
