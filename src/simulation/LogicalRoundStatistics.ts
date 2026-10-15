import {SessionRuntime} from "../runtime/SessionRuntime.js";
import type {CascadeResultProviding} from "../session/videoslot/cascade/CascadeResultProviding.js";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {LogicalRoundProgressProviding} from "../runtime/LogicalRound.js";

export type LogicalRoundStatistics = {rounds: number; steps: number; totalStake: number; totalWin: number};
export const emptyLogicalRoundStatistics = (): LogicalRoundStatistics => ({rounds: 0, steps: 0, totalStake: 0, totalWin: 0});

/** Half-open accepted-play coordinates, scoped to an executable session rather than a runner. */
type SubroundRange = [number, number];
export type LogicalSamplingRange = {trajectory: string; observed: SubroundRange[]; completed: SubroundRange[]};
export type LogicalSamplingAccounting = {carriedSubrounds: number; excludedSubrounds: number};
const trajectories = new WeakMap<GameSessionHandling, {id: string; position: number}>();
export function logicalSamplingPosition(session: GameSessionHandling): {id: string; position: number} {
    let trajectory = trajectories.get(session);
    if (!trajectory) {
        trajectory = {id: globalThis.crypto.randomUUID(), position: 0};
        trajectories.set(session, trajectory);
    }
    return {...trajectory};
}

function unionRanges(ranges: SubroundRange[]): SubroundRange[] {
    const result: SubroundRange[] = [];
    for (const [start, end] of ranges.map(([a, b]): SubroundRange => [a, b]).sort((a, b) => a[0] - b[0])) {
        const last = result[result.length - 1];
        if (last && start <= last[1]) last[1] = Math.max(last[1], end);
        else result.push([start, end]);
    }
    return result;
}

/** Union by session identity reconciles chunk tails with later completions, without
 * cancelling a carried prefix against an unrelated unfinished tail or another worker. */
export function mergeLogicalSamplingRanges(a: LogicalSamplingRange[], b: LogicalSamplingRange[]): LogicalSamplingRange[] {
    const merged = new Map<string, LogicalSamplingRange>();
    for (const range of [...a, ...b]) {
        const previous = merged.get(range.trajectory);
        merged.set(range.trajectory, {trajectory: range.trajectory,
            observed: unionRanges([...(previous?.observed ?? []), ...range.observed]),
            completed: unionRanges([...(previous?.completed ?? []), ...range.completed])});
    }
    return [...merged.values()];
}

export function logicalSamplingAccounting(ranges: LogicalSamplingRange[]): LogicalSamplingAccounting {
    let carriedSubrounds = 0, 
        excludedSubrounds = 0;
    for (const {observed, completed} of ranges) {
        let overlap = 0;
        for (const [a, b] of observed) for (const [c, d] of completed) overlap += Math.max(0, Math.min(b, d) - Math.max(a, c));
        carriedSubrounds += completed.reduce((sum, [a, b]) => sum + b - a, 0) - overlap;
        excludedSubrounds += observed.reduce((sum, [a, b]) => sum + b - a, 0) - overlap;
    }
    return {carriedSubrounds, excludedSubrounds};
}

/** Unfinished observations survive runner/chunk changes without retaining screens. */
const pending = new WeakMap<GameSessionHandling, {steps: number; stake: number; win: number}>();
export function observeLogicalSubround(session: GameSessionHandling, stake: number, win: number): LogicalRoundStatistics | undefined {
    const progress = session as Partial<LogicalRoundProgressProviding>;
    if (!SessionRuntime.supportsLogicalRoundDelivery(session)) return undefined;
    logicalSamplingPosition(session);
    trajectories.get(session)!.position++;
    if ((session as Partial<CascadeResultProviding>).getCascadeResult?.().getMetadata().maxCascadeStepsExceeded === true) {
        pending.delete(session);
        return undefined;
    }
    const retained = pending.get(session);
    // A bare executable feature snapshot cannot prove the entry accounting of a tail first seen here.
    if (retained === undefined && stake === 0) return undefined;
    const observation = retained ?? {steps: 0, stake: 0, win: 0};
    observation.steps++;
    observation.stake += stake;
    observation.win += win;
    if (progress.hasPendingLogicalRound?.()) {
        pending.set(session, observation);
        return undefined;
    }
    pending.delete(session);
    return {rounds: 1, steps: observation.steps, totalStake: observation.stake, totalWin: observation.win};
}
export function mergeLogicalRoundStatistics(a: LogicalRoundStatistics, b: LogicalRoundStatistics): LogicalRoundStatistics {
    return {rounds: a.rounds + b.rounds, steps: a.steps + b.steps, totalStake: a.totalStake + b.totalStake, totalWin: a.totalWin + b.totalWin};
}
