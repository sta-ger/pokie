import type {GameBlueprint} from "../../generated/GameBlueprint.js";
import {resolveBetModeCodegenWiring} from "../../generated/resolveBetModeCodegenWiring.js";
import {VideoSlotConfig} from "../../session/videoslot/VideoSlotConfig.js";
import {VideoSlotWithFreeGamesConfig} from "../../session/videoslot/VideoSlotWithFreeGamesConfig.js";
import {VideoSlotSession} from "../../session/videoslot/VideoSlotSession.js";
import {VideoSlotWithFreeGamesSession} from "../../session/videoslot/VideoSlotWithFreeGamesSession.js";
import {BoundedVideoSlotSession} from "../../session/videoslot/authored/BoundedVideoSlotSession.js";
import type {WeightedBonus} from "../../session/videoslot/authored/WeightedBonus.js";
import {VideoSlotWinCalculator} from "../../session/videoslot/wincalculator/VideoSlotWinCalculator.js";
import {WaysWinCalculator} from "../../session/videoslot/wincalculator/WaysWinCalculator.js";
import {ClusterWinCalculator} from "../../session/videoslot/wincalculator/ClusterWinCalculator.js";
import {SelectedEvaluatorGroupWinAggregationPolicy} from "../../session/videoslot/winevaluation/SelectedEvaluatorGroupWinAggregationPolicy.js";
import {SymbolsCombinationsGenerator} from "../../session/videoslot/combinations/SymbolsCombinationsGenerator.js";
import {SymbolsCombination} from "../../session/videoslot/combinations/SymbolsCombination.js";
import {SymbolsSequence} from "../../session/videoslot/combinations/SymbolsSequence.js";
import {SeededRandomNumberGenerator} from "../../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {ReelsSymbolsSequencesGenerator} from "../../session/videoslot/combinations/ReelsSymbolsSequencesGenerator.js";
import {Paytable} from "../../session/videoslot/paytable/Paytable.js";
import {CustomLinesDefinitions} from "../../session/videoslot/linesdefinitions/CustomLinesDefinitions.js";
import {VideoSlotWithHoldAndWinSession} from "../../session/videoslot/holdandwin/VideoSlotWithHoldAndWinSession.js";
import {SymbolSetHoldAndWinCollector} from "../../session/videoslot/holdandwin/SymbolSetHoldAndWinCollector.js";
import {MinimumCountHoldAndWinTrigger} from "../../session/videoslot/holdandwin/MinimumCountHoldAndWinTrigger.js";
import {SumWithMultiplierHoldAndWinPayoutAggregator} from "../../session/videoslot/holdandwin/SumWithMultiplierHoldAndWinPayoutAggregator.js";
import {VideoSlotWithJackpotSession} from "../../session/videoslot/jackpot/VideoSlotWithJackpotSession.js";
import {FixedJackpotPool} from "../../session/videoslot/jackpot/FixedJackpotPool.js";
import {AccumulatingJackpotPool} from "../../session/videoslot/jackpot/AccumulatingJackpotPool.js";
import {PercentageOfBetJackpotContributor} from "../../session/videoslot/jackpot/PercentageOfBetJackpotContributor.js";
import {SymbolCountJackpotTrigger} from "../../session/videoslot/jackpot/SymbolCountJackpotTrigger.js";
import {SingleTierJackpotAwarding} from "../../session/videoslot/jackpot/SingleTierJackpotAwarding.js";
import {VideoSlotWithBetModesSession} from "../../session/videoslot/betmode/VideoSlotWithBetModesSession.js";
import {BetModeDefinition} from "../../session/videoslot/betmode/BetModeDefinition.js";
import {BetModesConfig} from "../../session/videoslot/betmode/BetModesConfig.js";
import {FreeGamesForcedFeatureEntryHandler} from "../../session/videoslot/betmode/FreeGamesForcedFeatureEntryHandler.js";
import {PerModeForcedFeatureEntryHandler} from "../../session/videoslot/betmode/PerModeForcedFeatureEntryHandler.js";
import type {VideoSlotSessionHandling} from "../../session/videoslot/VideoSlotSessionHandling.js";

/** Only replaces entropy with enumerated support choices. Execution stays in production handlers. */
export function createAnalysisSession(model: GameBlueprint, strips: string[][], screens: string[][][], choose: (size: number) => number, consumeScreen: (index: number) => void) {
    const config = new VideoSlotConfig(undefined, new ReelsSymbolsSequencesGenerator(new SeededRandomNumberGenerator(0)));
    if (model.availableBets) config.setAvailableBets(model.availableBets);
    config.setReelsNumber(model.reels);
    config.setReelsSymbolsNumber(model.rows);
    if (model.screenGeometry) config.setScreenGeometry(model.screenGeometry);
    config.setWildSymbols(model.wilds ?? []);
    config.setScatterSymbols(model.scatters ?? []);
    config.setAvailableSymbols(model.symbols);
    config.setSymbolsSequences(strips.map(strip => new SymbolsSequence<string>().fromArray(strip)));
    if (model.mechanics?.modifiers) config.setScreenModifiers(model.mechanics.modifiers);
    const paytable = new Paytable<string>(config.getAvailableBets());
    for (const [symbol, payouts] of Object.entries(model.paytable)) for (const [count, payout] of Object.entries(payouts)) paytable.setPayoutForSymbol(symbol, Number(count), payout);
    config.setPaytable(paytable);
    const lines = new CustomLinesDefinitions();
    (model.paylines ?? Array.from({length: model.screenGeometry?.evaluated.rows ?? model.rows}, (_, row) => Array.from({length: model.reels}, () => row)))
        .forEach((line, index) => lines.setLineDefinition(String(index), line));
    config.setLinesDefinitions(lines);
    const free = model.mechanics?.freeGames;
    const actualConfig = free ? new VideoSlotWithFreeGamesConfig(config, {}) : config;
    if (actualConfig instanceof VideoSlotWithFreeGamesConfig && free) for (const [count, grant] of Object.entries(free.awardsByCount)) actualConfig.setFreeGamesForScatters(free.scatterSymbol, Number(count), grant);
    let started = false;
    const generator = new class extends SymbolsCombinationsGenerator<string> {
        // The instrument owns no external RNG. Failed choice prefixes are discarded and replayed
        // from initialization, so the production rollback codec remains sufficient for this probe.
        public override isRandomStateRestorable(): boolean {
            return true;
        }
        public override getRandomStateCodec(): "seeded" {
            return "seeded";
        }
        public override generateSymbolsCombination() {
            const index = started ? choose(screens.length) : 0;
            consumeScreen(index);
            const combination = new SymbolsCombination<string>().fromMatrix(screens[index]);
            return model.screenGeometry ? combination.withCoordinates(model.screenGeometry) : combination;
        }
        public override selectBonus(table: WeightedBonus) {
            const outcomes = table.outcomes.filter(outcome => outcome.weight > 0);
            return outcomes[choose(outcomes.length)];
        }
    }(actualConfig, new SeededRandomNumberGenerator(0));
    const win = model.winModel;
    const calculator = new VideoSlotWinCalculator(actualConfig, undefined, undefined,
        win?.type === "clusters" ? new ClusterWinCalculator(actualConfig, win.minimumClusterSize ?? 5) : undefined,
        undefined, win?.type === "ways" ? new WaysWinCalculator(actualConfig) : undefined,
        win?.type === "ways" || win?.type === "clusters" ? {aggregationPolicy: new SelectedEvaluatorGroupWinAggregationPolicy(win.type === "ways" ? "ways" : "cluster")} : {});
    const bounded = Object.fromEntries(Object.entries(model.mechanics ?? {}).filter(([key]) => ["cascade", "respins", "collection", "weightedBonus"].includes(key)));
    let session: VideoSlotSessionHandling<string>;
    if (Object.keys(bounded).length) session = new BoundedVideoSlotSession(config, generator, bounded, calculator);
    else if (actualConfig instanceof VideoSlotWithFreeGamesConfig) session = new VideoSlotWithFreeGamesSession(actualConfig, generator, calculator);
    else session = new VideoSlotSession(config, generator, calculator);
    const hold = model.mechanics?.holdAndWin;
    if (hold) session = new VideoSlotWithHoldAndWinSession(session, hold.initialRespins, new SymbolSetHoldAndWinCollector(hold.symbolEffects), new MinimumCountHoldAndWinTrigger(hold.minimumCount), new SumWithMultiplierHoldAndWinPayoutAggregator(hold.payout.amountsAreBetMultiples));
    const wiring = resolveBetModeCodegenWiring(model);
    if (wiring) session = new VideoSlotWithBetModesSession(session, new BetModesConfig(model.betModes!.map(mode => new BetModeDefinition(mode.id, {stakeMultiplier: mode.costMultiplier, forcesFeatureEntry: mode.runtimeType === "buyFeature", targetRtp: mode.targetRtp})), wiring.defaultModeId),
        new PerModeForcedFeatureEntryHandler(new Map(wiring.buyFeatureModes.map(mode => [mode.id, new FreeGamesForcedFeatureEntryHandler(mode.forcedFreeGames)]))));
    const jackpot = model.mechanics?.jackpot;
    if (jackpot) session = new VideoSlotWithJackpotSession(session, [jackpot.pool.type === "fixed" ? new FixedJackpotPool(jackpot.pool.id, jackpot.pool.amount) : new AccumulatingJackpotPool(jackpot.pool.id, jackpot.pool.seedValue)], new PercentageOfBetJackpotContributor(jackpot.contribution.percentage), new SymbolCountJackpotTrigger(jackpot.trigger.symbolId, jackpot.trigger.minimumCount), new SingleTierJackpotAwarding());
    return {session, start: () => {
        started = true;
    }};
}
