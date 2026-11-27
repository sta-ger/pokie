import type {AuthoredCascade, AuthoredCollection, AuthoredRespins, FeatureChains} from "../../../../src/session/videoslot/authored/FeatureChains.js";
import type {WeightedBonus} from "../../../../src/session/videoslot/authored/WeightedBonus.js";
import type {ScreenModifiers} from "../../../../src/session/videoslot/modifiers/ScreenModifiers.js";
import type {GameBlueprintHoldAndWin, GameBlueprintJackpot} from "../../../../src/generated/GameBlueprint.js";

export type MechanicStartingPreset = "safe" | "conservative" | "generous";
export type FeatureChainPresetKey = "cascade" | "respins" | "collection";

export const MECHANIC_PRESET_LABELS: Readonly<Record<MechanicStartingPreset, string>> = {
    safe: "Safe demo",
    conservative: "Conservative",
    generous: "Generous",
};

export const MECHANIC_PRESET_DESCRIPTION =
    "Starting values only. Exact math and simulation still decide whether the mechanic fits your RTP and volatility target.";

const CASCADE_MAX: Readonly<Record<MechanicStartingPreset, number>> = {safe: 20, conservative: 10, generous: 50};
const RESPIN_GRANT: Readonly<Record<MechanicStartingPreset, number>> = {safe: 3, conservative: 2, generous: 5};
const RESPIN_MAX: Readonly<Record<MechanicStartingPreset, number>> = {safe: 30, conservative: 15, generous: 50};
const COLLECTION_CONTRIBUTION: Readonly<Record<MechanicStartingPreset, number>> = {safe: 1, conservative: 1, generous: 2};
const COLLECTION_THRESHOLD: Readonly<Record<MechanicStartingPreset, number>> = {safe: 10, conservative: 20, generous: 15};
const COLLECTION_CAP: Readonly<Record<MechanicStartingPreset, number>> = {safe: 10, conservative: 20, generous: 15};
const COLLECTION_PAYOUT: Readonly<Record<MechanicStartingPreset, number>> = {safe: 5, conservative: 10, generous: 25};
const WILD_FACTOR: Readonly<Record<MechanicStartingPreset, number | undefined>> = {safe: undefined, conservative: 2, generous: 3};
const HOLD_MINIMUM: Readonly<Record<MechanicStartingPreset, number>> = {safe: 1, conservative: 2, generous: 1};
const HOLD_RESPINS: Readonly<Record<MechanicStartingPreset, number>> = {safe: 3, conservative: 2, generous: 5};
const HOLD_AMOUNT: Readonly<Record<MechanicStartingPreset, number>> = {safe: 1, conservative: 1, generous: 2};
const JACKPOT_POOL: Readonly<Record<MechanicStartingPreset, number>> = {safe: 10, conservative: 25, generous: 100};
const JACKPOT_CONTRIBUTION: Readonly<Record<MechanicStartingPreset, number>> = {safe: 0.01, conservative: 0.005, generous: 0.01};
const JACKPOT_MINIMUM: Readonly<Record<MechanicStartingPreset, number>> = {safe: 1, conservative: 2, generous: 1};

/**
 * Producer-facing starting points for the authored mechanics. The exact preview remains the
 * authority: these presets only replace the raw numeric defaults that previously forced an author to
 * invent award ladders, caps and contribution rates before seeing any effect on the math.
 */
export function featureChainPreset(
    key: FeatureChainPresetKey,
    symbols: readonly string[],
    preset: MechanicStartingPreset,
): NonNullable<FeatureChains[FeatureChainPresetKey]> {
    const first = symbols[0] ?? "";
    if (key === "cascade") {
        const cascade: AuthoredCascade = {maxCascades: CASCADE_MAX[preset]};
        return cascade;
    }
    if (key === "respins") {
        const respins: AuthoredRespins = {
            trigger: {symbolId: first, minimumCount: 1},
            grant: RESPIN_GRANT[preset],
            retrigger: "none",
            maxRespins: RESPIN_MAX[preset],
        };
        return respins;
    }
    const collection: AuthoredCollection = {
        symbolId: first,
        contribution: COLLECTION_CONTRIBUTION[preset],
        threshold: COLLECTION_THRESHOLD[preset],
        cap: COLLECTION_CAP[preset],
        reset: "zero",
        payout: COLLECTION_PAYOUT[preset],
    };
    return collection;
}

const WEIGHTED_BONUS_OUTCOMES: Readonly<Record<MechanicStartingPreset, WeightedBonus["outcomes"]>> = {
    safe: [
        {id: "small", weight: 1, targetId: "bonus-respins", payout: 1, payoutUnits: "bet-multiple", duration: 0},
        {id: "large", weight: 3, targetId: "bonus-respins", payout: 5, payoutUnits: "bet-multiple", duration: 2},
    ],
    conservative: [
        {id: "small", weight: 5, targetId: "bonus-respins", payout: 1, payoutUnits: "bet-multiple", duration: 0},
        {id: "large", weight: 1, targetId: "bonus-respins", payout: 3, payoutUnits: "bet-multiple", duration: 1},
    ],
    generous: [
        {id: "small", weight: 10, targetId: "bonus-respins", payout: 2, payoutUnits: "bet-multiple", duration: 0},
        {id: "large", weight: 1, targetId: "bonus-respins", payout: 25, payoutUnits: "bet-multiple", duration: 3},
    ],
};

const WEIGHTED_BONUS_DURATION: Readonly<Record<MechanicStartingPreset, number>> = {safe: 10, conservative: 10, generous: 15};

export function weightedBonusPreset(symbols: readonly string[], preset: MechanicStartingPreset): WeightedBonus {
    const first = symbols[0] ?? "";
    return {
        id: "bonus",
        context: "triggered-paid-entry",
        trigger: {symbolId: first, minimumCount: 1},
        feature: {id: "bonus-respins", type: "bonus-respins", maxDuration: WEIGHTED_BONUS_DURATION[preset]},
        outcomes: WEIGHTED_BONUS_OUTCOMES[preset].map((outcome) => ({...outcome})),
    };
}

export function wildModifiersPreset(wilds: readonly string[], preset: MechanicStartingPreset): ScreenModifiers {
    const first = wilds[0];
    if (first === undefined) return {wilds: [], rules: []};
    const factor = WILD_FACTOR[preset];
    return {wilds: [factor === undefined ? {symbol: first} : {symbol: first, factor}], rules: []};
}

export function holdAndWinPreset(symbols: readonly string[], preset: MechanicStartingPreset): GameBlueprintHoldAndWin {
    const first = symbols[0] ?? "";
    return {
        minimumCount: HOLD_MINIMUM[preset],
        initialRespins: HOLD_RESPINS[preset],
        retriggerPolicy: "reset-on-new-lock",
        symbolEffects: {[first]: {kind: "value", amount: HOLD_AMOUNT[preset]}},
        payout: {type: "sum-with-multiplier", amountsAreBetMultiples: false},
    };
}

export function jackpotPreset(symbols: readonly string[], preset: MechanicStartingPreset): GameBlueprintJackpot {
    const first = symbols[0] ?? "";
    return {
        pool: {id: "mini", type: "fixed", amount: JACKPOT_POOL[preset]},
        contribution: {type: "percentage", percentage: JACKPOT_CONTRIBUTION[preset]},
        trigger: {type: "symbol-count", symbolId: first, minimumCount: JACKPOT_MINIMUM[preset]},
        award: "single-tier",
    };
}
