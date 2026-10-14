import type {HoldAndWinStateDetermining} from "../../session/videoslot/holdandwin/HoldAndWinStateDetermining.js";
import type {JackpotStateDetermining} from "../../session/videoslot/jackpot/JackpotStateDetermining.js";

/** Public observations only; no RNG or executable snapshots. Decorators forward these capabilities. */
export function observeVideoSlotFeatures<T extends string | number | symbol = string>(session: unknown) {
    const hold = session as Partial<HoldAndWinStateDetermining<T>>;
    const jackpot = session as Partial<JackpotStateDetermining<T>>;
    const mode = (session as {getChargedBetModeId?: () => string | undefined}).getChargedBetModeId?.();
    const outcome = jackpot.getJackpotLastRoundOutcome?.();
    return {
        ...(hold.isHoldAndWinActive ? {holdAndWin: {active: hold.isHoldAndWinActive(), locks: hold.getLockedHoldAndWinSymbols!(), respinsRemaining: hold.getHoldAndWinRespinsRemaining!(), payout: hold.getHoldAndWinPayout!()}} : {}),
        ...(jackpot.getJackpotPools ? {jackpot: {pools: jackpot.getJackpotPools().map(pool => ({id: pool.getId(), value: pool.getValue()})), statistics: jackpot.getJackpotPoolStatistics!(), ...(outcome?.kind === "awarded" ? {award: {poolId: outcome.poolId, amount: outcome.amount}} : {})}} : {}),
        ...(mode ? {chargedBetModeId: mode} : {}),
    };
}
