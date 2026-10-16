import {assertSharedSlotMathModel, lowerSharedSlotMath, stableSlotMathJson, type SharedSlotMathModel} from "../../../../wasm/math/SharedSlotMath.js";
import type {VideoSlotConfigDescribing} from "../../VideoSlotConfigDescribing.js";
import {VideoSlotConfig} from "../../VideoSlotConfig.js";
import {isWeightedSymbolsSequence} from "../../combinations/WeightedSymbolsSequence.js";
import {ScreenProjection} from "../../coordinates/ScreenProjection.js";
import {VideoSlotWithFreeGamesConfig} from "../../VideoSlotWithFreeGamesConfig.js";
import {SymbolsSequence} from "../../combinations/SymbolsSequence.js";
import {LeftToRightLinesPatterns} from "../../linespatterns/LeftToRightLinesPatterns.js";

/** Only the supported built-in configuration can be lowered; never discard authored rules. */
function configuredModel<T extends string | number | symbol>(
    config: VideoSlotConfigDescribing<T>, winModel: SharedSlotMathModel["winModel"], bet: number,
): SharedSlotMathModel {
    if (!(config instanceof VideoSlotConfig || config instanceof VideoSlotWithFreeGamesConfig) || !config.isResolvedForSessionRestoration() ||
        config.getSymbolsSequences().some(strip => strip.constructor !== SymbolsSequence && !isWeightedSymbolsSequence(strip)) ||
        !config.getAvailableBets().length || !config.getAvailableBets().every(amount => Number.isFinite(amount) && amount > 0) ||
        !config.getAvailableBets().includes(bet) || config.getLinesPatterns().constructor !== LeftToRightLinesPatterns ||
        stableSlotMathJson(config.getLinesPatterns().toArray()) !== stableSlotMathJson(new LeftToRightLinesPatterns(config.getReelsNumber()).toArray())) {
        throw new Error("Shared math cannot lower this config's patterns, wild rules, modifiers or custom strategies.");
    }
    const model: SharedSlotMathModel = {
        schemaVersion: "pokie.game.v2", mathVersion: "pokie.math.v2",
        reels: config.getReelsNumber(), rows: config.getScreenGeometry?.() ? new ScreenProjection(config.getScreenGeometry()!).getRows("evaluated") : config.getReelsSymbolsNumber(),
        symbols: config.getAvailableSymbols() as string[], winModel,
        reelStrips: config.getSymbolsSequences().map(strip => isWeightedSymbolsSequence(strip) ? strip.getVariants()[0].symbols : strip.toArray()) as string[][],
        paylines: config.getLinesDefinitions().getLinesIds().map(id => config.getLinesDefinitions().getLineDefinition(id)),
        wilds: config.getWildSymbols() as string[], scatters: config.getScatterSymbols() as string[],
        ...(Reflect.ownKeys(config.getWildSubstitutions()).length || config.getScreenModifiers?.() ? {wildSubstitutions: config.getWildSubstitutions() as Record<string, string[]>} : {}),
        // The public Paytable stores exact stake-scaled amounts, including bet-specific edits.
        // Evaluate those amounts at unit stake: dividing back to multipliers loses precision.
        paytable: Object.fromEntries(config.getPaytable().getAvailableSymbolsForBet(bet).map(symbol => [String(symbol),
            Object.fromEntries(config.getPaytable().getNumbersOfSymbolsForBet(bet, symbol).map(count => [count, config.getPaytable().getWinAmountForSymbol(symbol, count, bet)]))])), availableBets: [1],
    };
    return model;
}

/** Codec/constructor checks must not evaluate an inactive denomination's payout.
 * Keep the table's symbols/counts, while arithmetic validates the selected stake.
 */
function assertStructure(model: SharedSlotMathModel): void {
    const paytable = Object.fromEntries(Object.entries(model.paytable).map(([symbol, entries]) => [symbol, Object.fromEntries(Object.keys(entries).map(count => [count, 0]))]));
    assertSharedSlotMathModel({...model, paytable});
}

export function assertConfiguredSharedSlotMathStructure<T extends string | number | symbol>(config: VideoSlotConfigDescribing<T>, winModel: SharedSlotMathModel["winModel"]): void {
    for (const bet of config.getAvailableBets()) assertStructure(configuredModel(config, winModel, bet));
}

export function resolveConfiguredSharedSlotMath<T extends string | number | symbol>(config: VideoSlotConfigDescribing<T>, winModel: SharedSlotMathModel["winModel"], bet: number): SharedSlotMathModel {
    const model = configuredModel(config, winModel, bet);
    if (Object.values(model.paytable).some(entries => Object.values(entries).some(amount => amount === Infinity))) throw new Error("Shared math payout overflow for the selected bet.");
    assertSharedSlotMathModel(model);
    return model;
}

/** A supplied model is a declaration, not permission to override a different public config. */
export function assertSharedSlotMathConfig<T extends string | number | symbol>(config: VideoSlotConfigDescribing<T>, model: SharedSlotMathModel): void {
    lowerSharedSlotMath(model);
    const normalize = (value: SharedSlotMathModel): unknown => ({...value, paytable: {}, availableBets: config.getAvailableBets(),
        winModel: {type: value.winModel.type, minimumClusterSize: value.winModel.minimumClusterSize ?? 5},
        wilds: value.wilds ?? [], scatters: value.scatters ?? []});
    if (stableSlotMathJson(config.getAvailableBets()) !== stableSlotMathJson(model.availableBets) ||
        stableSlotMathJson(normalize(configuredModel(config, model.winModel, config.getAvailableBets()[0]))) !== stableSlotMathJson(normalize(model))) {
        throw new Error("Shared math model does not match the public config.");
    }
    for (const bet of config.getAvailableBets()) {
        const current = configuredModel(config, model.winModel, bet);
        assertStructure(current);
        for (const symbol of new Set([...Object.keys(current.paytable), ...Object.keys(model.paytable)])) {
            for (const count of new Set([...Object.keys(current.paytable[symbol] ?? {}), ...Object.keys(model.paytable[symbol] ?? {})])) {
                if ((current.paytable[symbol]?.[count] ?? 0) !== (model.paytable[symbol]?.[count] ?? 0) * bet) {
                    throw new Error("Shared math model paytable does not match the public config.");
                }
            }
        }
    }
}
