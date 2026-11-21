import type {HoldAndWinStateDetermining} from "../../session/videoslot/holdandwin/HoldAndWinStateDetermining.js";
import type {LockedHoldAndWinSymbol} from "../../session/videoslot/holdandwin/LockedHoldAndWinSymbol.js";
import type {JackpotStateDetermining} from "../../session/videoslot/jackpot/JackpotStateDetermining.js";
import type {JackpotPoolStatisticsSnapshot} from "../../session/JackpotStatisticsSnapshot.js";
import type {ScreenModifierObservation} from "../../session/videoslot/modifiers/ScreenModifiers.js";
import type {FeatureChainObservation, FeatureChainsProviding} from "../../session/videoslot/authored/FeatureChains.js";

// A browser-safe structural return type. Keeping the imported types on this module's own relative
// paths (rather than letting declaration emit point at the package root) keeps browser.d.ts from
// pulling in Node/PAR/ExcelJS declarations through index.d.ts.
export type VideoSlotFeatureObservation<T extends string | number | symbol = string> = {
    featureChains?: FeatureChainObservation;
    modifiers?: ScreenModifierObservation<T>;
    holdAndWin?: {
        active: boolean;
        locks: readonly LockedHoldAndWinSymbol<T>[];
        respinsRemaining: number;
        payout: number;
    };
    jackpot?: {
        pools: {id: string; value: number}[];
        statistics: Readonly<Record<string, JackpotPoolStatisticsSnapshot>>;
        award?: {poolId: string; amount: number};
    };
    chargedBetModeId?: string;
};

/** Public observations only; no RNG or executable snapshots. Decorators forward these capabilities. */
export function observeVideoSlotFeatures<T extends string | number | symbol = string>(session: unknown): VideoSlotFeatureObservation<T> {
    const hold = session as Partial<HoldAndWinStateDetermining<T>>;
    const jackpot = session as Partial<JackpotStateDetermining<T>>;
    const mode = (session as {getChargedBetModeId?: () => string | undefined}).getChargedBetModeId?.();
    const outcome = jackpot.getJackpotLastRoundOutcome?.();
    const modifiers = (session as {getModifierObservation?: () => ScreenModifierObservation<T> | undefined}).getModifierObservation?.();
    const bounded = (session as Partial<FeatureChainsProviding>).getFeatureChainObservation?.();
    return {
        ...(bounded ? {featureChains: bounded} : {}),
        ...(modifiers ? {modifiers} : {}),
        ...(hold.isHoldAndWinActive ? {holdAndWin: {active: hold.isHoldAndWinActive(), locks: hold.getLockedHoldAndWinSymbols!(), respinsRemaining: hold.getHoldAndWinRespinsRemaining!(), payout: hold.getHoldAndWinPayout!()}} : {}),
        ...(jackpot.getJackpotPools ? {jackpot: {pools: jackpot.getJackpotPools().map(pool => ({id: pool.getId(), value: pool.getValue()})), statistics: jackpot.getJackpotPoolStatistics!(), ...(outcome?.kind === "awarded" ? {award: {poolId: outcome.poolId, amount: outcome.amount}} : {})}} : {}),
        ...(mode ? {chargedBetModeId: mode} : {}),
    };
}
