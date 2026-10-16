import type {PortableRandomNumberGenerator} from "../session/videoslot/combinations/internal/PortableRandomNumberGenerator.js";
import type {GameBlueprint} from "./GameBlueprint.js";
import {resolveSharedSlotMathModel} from "./resolveSharedSlotMathModel.js";
import {resolveBetModeCodegenWiring} from "./resolveBetModeCodegenWiring.js";
import {VideoSlotConfig} from "../session/videoslot/VideoSlotConfig.js";
import {VideoSlotWithFreeGamesConfig} from "../session/videoslot/VideoSlotWithFreeGamesConfig.js";
import {VideoSlotSession} from "../session/videoslot/VideoSlotSession.js";
import {VideoSlotWithFreeGamesSession} from "../session/videoslot/VideoSlotWithFreeGamesSession.js";
import type {VideoSlotSessionHandling} from "../session/videoslot/VideoSlotSessionHandling.js";
import {Paytable} from "../session/videoslot/paytable/Paytable.js";
import {CustomLinesDefinitions} from "../session/videoslot/linesdefinitions/CustomLinesDefinitions.js";
import {SymbolsSequence} from "../session/videoslot/combinations/SymbolsSequence.js";
import {WeightedSymbolsSequence} from "../session/videoslot/combinations/WeightedSymbolsSequence.js";
import {SymbolsCombinationsGenerator} from "../session/videoslot/combinations/SymbolsCombinationsGenerator.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {VideoSlotWinCalculator} from "../session/videoslot/wincalculator/VideoSlotWinCalculator.js";
import {BoundedVideoSlotSession} from "../session/videoslot/authored/BoundedVideoSlotSession.js";
import {VideoSlotWithHoldAndWinSession} from "../session/videoslot/holdandwin/VideoSlotWithHoldAndWinSession.js";
import {SymbolSetHoldAndWinCollector} from "../session/videoslot/holdandwin/SymbolSetHoldAndWinCollector.js";
import {MinimumCountHoldAndWinTrigger} from "../session/videoslot/holdandwin/MinimumCountHoldAndWinTrigger.js";
import {SumWithMultiplierHoldAndWinPayoutAggregator} from "../session/videoslot/holdandwin/SumWithMultiplierHoldAndWinPayoutAggregator.js";
import {VideoSlotWithBetModesSession} from "../session/videoslot/betmode/VideoSlotWithBetModesSession.js";
import {BetModeDefinition} from "../session/videoslot/betmode/BetModeDefinition.js";
import {BetModesConfig} from "../session/videoslot/betmode/BetModesConfig.js";
import {PerModeForcedFeatureEntryHandler} from "../session/videoslot/betmode/PerModeForcedFeatureEntryHandler.js";
import {FreeGamesForcedFeatureEntryHandler} from "../session/videoslot/betmode/FreeGamesForcedFeatureEntryHandler.js";
import {VideoSlotWithJackpotSession} from "../session/videoslot/jackpot/VideoSlotWithJackpotSession.js";
import {FixedJackpotPool} from "../session/videoslot/jackpot/FixedJackpotPool.js";
import {AccumulatingJackpotPool} from "../session/videoslot/jackpot/AccumulatingJackpotPool.js";
import {PercentageOfBetJackpotContributor} from "../session/videoslot/jackpot/PercentageOfBetJackpotContributor.js";
import {SymbolCountJackpotTrigger} from "../session/videoslot/jackpot/SymbolCountJackpotTrigger.js";
import {SingleTierJackpotAwarding} from "../session/videoslot/jackpot/SingleTierJackpotAwarding.js";

/** Resolved declarative assembly shared by generated packages and portable hosts.
 * No extraction, filesystem access, code evaluation or alternate feature engine.
 */
export function createAuthoredSession(blueprint: GameBlueprint, random: SeededRandomNumberGenerator | PortableRandomNumberGenerator) {
    const config = new VideoSlotConfig();
    config.setAvailableBets(blueprint.availableBets ?? [1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100]);
    config.setReelsNumber(blueprint.reels);
    config.setReelsSymbolsNumber(blueprint.rows);
    if (blueprint.screenGeometry) config.setScreenGeometry(blueprint.screenGeometry);
    config.setWildSymbols(blueprint.wilds ?? []);
    config.setScatterSymbols(blueprint.scatters ?? []);
    config.setAvailableSymbols(blueprint.symbols);
    if (blueprint.mechanics?.modifiers) config.setScreenModifiers(blueprint.mechanics.modifiers);
    const paytable = new Paytable<string>(config.getAvailableBets());
    for (const [symbol, amounts] of Object.entries(blueprint.paytable)) for (const [count, amount] of Object.entries(amounts)) paytable.setPayoutForSymbol(symbol, Number(count), amount);
    config.setPaytable(paytable);
    const model = resolveSharedSlotMathModel(blueprint);
    const lines = new CustomLinesDefinitions();
    model.paylines.forEach((line, index) => lines.setLineDefinition(String(index), [...line]));
    config.setLinesDefinitions(lines);
    config.setSymbolsSequences(blueprint.reelSequences?.map(reel => reel.type === "weighted"
        ? new WeightedSymbolsSequence(reel.variants, blueprint.symbols) : new SymbolsSequence().fromArray(reel.symbols))
        ?? blueprint.reelStrips!.map(strip => new SymbolsSequence().fromArray(strip)));
    const free = blueprint.mechanics?.freeGames;
    const resolved = free ? new VideoSlotWithFreeGamesConfig(config, {}) : config;
    if (free && resolved instanceof VideoSlotWithFreeGamesConfig) for (const [count, grant] of Object.entries(free.awardsByCount)) resolved.setFreeGamesForScatters(free.scatterSymbol, Number(count), grant);
    const generator = new SymbolsCombinationsGenerator(resolved, random);
    const calculator = new VideoSlotWinCalculator(resolved, undefined, undefined, undefined, undefined, undefined, {sharedMathModel: model});
    const {cascade, respins, collection, weightedBonus} = blueprint.mechanics ?? {};
    const bounded = {...(cascade ? {cascade} : {}), ...(respins ? {respins} : {}), ...(collection ? {collection} : {}), ...(weightedBonus ? {weightedBonus} : {})};
    let session: VideoSlotSessionHandling;
    if (Object.keys(bounded).length) session = new BoundedVideoSlotSession(config, generator, bounded, calculator);
    else if (resolved instanceof VideoSlotWithFreeGamesConfig) session = new VideoSlotWithFreeGamesSession(resolved, generator, calculator);
    else session = new VideoSlotSession(resolved, generator, calculator);
    const hold = blueprint.mechanics?.holdAndWin;
    if (hold) session = new VideoSlotWithHoldAndWinSession(session, hold.initialRespins, new SymbolSetHoldAndWinCollector(hold.symbolEffects), new MinimumCountHoldAndWinTrigger(hold.minimumCount), new SumWithMultiplierHoldAndWinPayoutAggregator(hold.payout.amountsAreBetMultiples));
    const modes = resolveBetModeCodegenWiring(blueprint);
    if (modes) session = new VideoSlotWithBetModesSession(session, new BetModesConfig(blueprint.betModes!.map(mode => new BetModeDefinition(mode.id, {
        stakeMultiplier: mode.costMultiplier, forcesFeatureEntry: mode.runtimeType === "buyFeature", targetRtp: mode.targetRtp,
    })), modes.defaultModeId), new PerModeForcedFeatureEntryHandler(new Map(modes.buyFeatureModes.map(mode => [mode.id, new FreeGamesForcedFeatureEntryHandler(mode.forcedFreeGames)]))));
    const jackpot = blueprint.mechanics?.jackpot;
    if (jackpot) session = new VideoSlotWithJackpotSession(session, [jackpot.pool.type === "fixed" ? new FixedJackpotPool(jackpot.pool.id, jackpot.pool.amount) : new AccumulatingJackpotPool(jackpot.pool.id, jackpot.pool.seedValue)], new PercentageOfBetJackpotContributor(jackpot.contribution.percentage), new SymbolCountJackpotTrigger(jackpot.trigger.symbolId, jackpot.trigger.minimumCount), new SingleTierJackpotAwarding());
    return {session, generator, calculator, dispose: () => calculator.disposeSharedMath()};
}
