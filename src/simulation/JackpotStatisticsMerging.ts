import type {JackpotPoolStatisticsSnapshot, JackpotStatisticsSnapshot} from "../session/JackpotStatisticsSnapshot.js";

const ZERO_POOL_STATISTICS: JackpotPoolStatisticsSnapshot = {awardCount: 0, totalAwarded: 0, totalContributed: 0};

// Combines one additional chunk's/worker's jackpot statistics snapshot into a running total — mirrors
// mergeSimulationBreakdowns' own role/shape exactly (see that file's own doc comment), the one place this
// arithmetic lives. Safe across BOTH genuinely independent sessions (one per parallel worker) AND
// successive chunks of the *same* session's own simulation run — but only as long as every snapshot being
// merged is already itself a *run-scoped delta* (see subtractJackpotStatisticsSnapshots below), never a raw
// cumulative JackpotStatisticsSnapshot straight off a session (see JackpotStatisticsProviding's own doc
// comment: that snapshot reflects the session's *entire* lifetime, not any one particular run — merging two
// of those together would double-count). AggregateSimulationRunner.run() and runChunkedSimulation both
// already produce run-scoped deltas via subtractJackpotStatisticsSnapshots before anything here ever sees
// them, so by the time execution reaches this function, merging is always correct.
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

// The one canonical way to turn two raw, cumulative-since-session-start JackpotStatisticsSnapshot reads
// (one taken before a run started, one taken after it finished — see AggregateSimulationRunner.run()) into
// the run-scoped delta that run alone actually produced. Necessary because JackpotStatisticsProviding's own
// snapshot reflects the session's entire lifetime, not any one particular simulation run — a session that
// already had jackpot history before this run started (pre-populated/restored state, or a second run() call
// on an already-used session/runner) would otherwise leak that unrelated history into a report that's
// supposed to describe only the rounds just played.
//
// "before" is undefined for the common case (a freshly constructed session, or any session whose
// JackpotStatisticsProviding wasn't consulted before this run) — treated as "nothing to subtract", so
// "after" is returned as-is.
//
// Every per-pool figure (and, by construction, every top-level figure too — see the summation below) must
// be non-negative: "after" is expected to always be a later, cumulative superset of "before" for the exact
// same session. A negative result — "before" claiming more activity than "after" for the same pool, or
// "before" naming a pool "after" doesn't even have — means the two snapshots aren't a valid before/after
// pair for one continuous run (e.g. the session was reset, or two unrelated sessions' snapshots were passed
// in by mistake); this throws rather than silently producing a nonsensical negative-award report.
export function subtractJackpotStatisticsSnapshots(
    after: JackpotStatisticsSnapshot,
    before: JackpotStatisticsSnapshot | undefined,
): JackpotStatisticsSnapshot {
    if (before === undefined) {
        return after;
    }

    for (const poolId of Object.keys(before.pools)) {
        if (!(poolId in after.pools)) {
            throw new Error(
                `subtractJackpotStatisticsSnapshots: "before" has pool "${poolId}" that is missing from "after" — ` +
                    "these snapshots are not a valid before/after pair for the same session's run.",
            );
        }
    }

    const pools: Record<string, JackpotPoolStatisticsSnapshot> = {};
    let awardCount = 0;
    let totalAwarded = 0;
    let totalContributed = 0;
    for (const [poolId, afterStats] of Object.entries(after.pools)) {
        const beforeStats = before.pools[poolId] ?? ZERO_POOL_STATISTICS;
        const delta = subtractPoolStatistics(afterStats, beforeStats, poolId);
        pools[poolId] = delta;
        awardCount += delta.awardCount;
        totalAwarded += delta.totalAwarded;
        totalContributed += delta.totalContributed;
    }

    // Derived as the sum of the per-pool deltas just computed, never as a second, independent
    // after.awardCount - before.awardCount subtraction — this is what guarantees the result's own
    // top-level figures always equal the sum of its own pool entries by construction, regardless of
    // whether "after"/"before" themselves were perfectly self-consistent.
    return {awardCount, totalAwarded, totalContributed, pools};
}

function subtractPoolStatistics(
    after: JackpotPoolStatisticsSnapshot,
    before: JackpotPoolStatisticsSnapshot,
    poolId: string,
): JackpotPoolStatisticsSnapshot {
    const delta: JackpotPoolStatisticsSnapshot = {
        awardCount: after.awardCount - before.awardCount,
        totalAwarded: after.totalAwarded - before.totalAwarded,
        totalContributed: after.totalContributed - before.totalContributed,
    };
    if (delta.awardCount < 0 || delta.totalAwarded < 0 || delta.totalContributed < 0) {
        throw new Error(
            `subtractJackpotStatisticsSnapshots: pool "${poolId}" produced a negative delta ` +
                `(awardCount=${delta.awardCount}, totalAwarded=${delta.totalAwarded}, totalContributed=${delta.totalContributed}) — ` +
                '"after" must be a later, cumulative superset of "before" for the same pool.',
        );
    }
    return delta;
}
