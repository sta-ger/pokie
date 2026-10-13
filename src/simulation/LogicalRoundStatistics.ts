import {SessionRuntime} from "../runtime/SessionRuntime.js";
import type {CascadeResultProviding} from "../session/videoslot/cascade/CascadeResultProviding.js";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {LogicalRoundProgressProviding} from "../runtime/LogicalRound.js";

export type LogicalRoundStatistics = {rounds: number; steps: number; totalStake: number; totalWin: number};
export const emptyLogicalRoundStatistics = (): LogicalRoundStatistics => ({rounds: 0, steps: 0, totalStake: 0, totalWin: 0});

/** Per-executable-session unfinished observation survives runner/chunk changes, without retaining screens. */
const pending = new WeakMap<GameSessionHandling, {steps: number; stake: number; win: number}>();
export function observeLogicalSubround(session: GameSessionHandling, stake: number, win: number): LogicalRoundStatistics | undefined {
    const progress = session as Partial<LogicalRoundProgressProviding>;
    if (!SessionRuntime.supportsLogicalRoundDelivery(session)) return undefined;
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
