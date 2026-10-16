import type {VideoSlotWinCalculator} from "../../session/videoslot/wincalculator/VideoSlotWinCalculator.js";
import type {SessionFeatureAnalyticsBeforePlay} from "../../simulation/SessionFeatureAnalyticsObserver.js";
import {ValueWinComponent} from "../../session/videoslot/winevaluation/ValueWinComponent.js";
import {WinningValue} from "../../session/videoslot/WinningValue.js";
import {validateArtifactCoordinates} from "../../artifact/validateArtifactCoordinates.js";
import {buildRoundStepArtifact} from "../../artifact/buildRoundStepArtifact.js";
import {deriveStandardFeatureEvents} from "../../artifact/buildRoundArtifactFromSession.js";
import {SymbolsCombinationsAnalyzer} from "../../session/videoslot/combinations/SymbolsCombinationsAnalyzer.js";
import type {WonFreeGamesNumberDetermining} from "../../session/WonFreeGamesNumberDetermining.js";
import {ScreenModifierEngine} from "../../session/videoslot/modifiers/ScreenModifierEngine.js";
import {observeVideoSlotFeatures} from "../../net/videoslot/observeVideoSlotFeatures.js";
import {projectPublicFeatureEvent} from "../../artifact/PublicRoundArtifactProjector.js";
import {weightedBonusPayout, validateWeightedBonusObservation} from "../../session/videoslot/authored/WeightedBonus.js";
import type {BoundedSessionState} from "../../session/videoslot/authored/BoundedVideoSlotSession.js";
import {WinningWay} from "../../session/videoslot/WinningWay.js";
import {WinningCluster} from "../../session/videoslot/WinningCluster.js";
import type {PokieWasmFeatureSessionState} from "../PokieWasmRuntimeApi.js";
import type {GameBlueprint} from "../../generated/GameBlueprint.js";
import type {RoundStepArtifact} from "../../artifact/RoundStepArtifact.js";
import type {VideoSlotSessionHandling} from "../../session/videoslot/VideoSlotSessionHandling.js";
import {restoreWinEvaluation} from "../../session/videoslot/winevaluation/WinEvaluationSnapshot.js";
import {WinEvaluationResult} from "../../session/videoslot/winevaluation/WinEvaluationResult.js";
import {SymbolsCombination} from "../../session/videoslot/combinations/SymbolsCombination.js";
import {CascadeResult} from "../../session/videoslot/cascade/CascadeResult.js";
import {CascadeStep} from "../../session/videoslot/cascade/CascadeStep.js";
import {CascadeGridTransformer} from "../../session/videoslot/combinations/CascadeGridTransformer.js";
import {resolveRespinTransition, type BoundedMechanicObservation} from "../../session/videoslot/authored/BoundedMechanics.js";
import type {ScreenModifierObservation, ScreenModifierState} from "../../session/videoslot/modifiers/ScreenModifiers.js";
import {stableSlotMathJson} from "../math/SharedSlotMath.js";
import {ScreenProjection} from "../../session/videoslot/coordinates/ScreenProjection.js";

/** Rehydrate accepted observations for the existing serializers/analytics observer.
 * Existing stateless math validates retained screens; no RNG, wallet effect or prefix replay.
 */
export function restoreDeclarativeObservation(session: VideoSlotSessionHandling, blueprint: GameBlueprint, artifacts: readonly RoundStepArtifact[], finalScreen: string[][], win: number, componentAmounts: PokieWasmFeatureSessionState["feature"]["componentAmounts"], calculator: VideoSlotWinCalculator, before?: SessionFeatureAnalyticsBeforePlay): VideoSlotSessionHandling {
    const last = artifacts[artifacts.length - 1];
    if (!last) throw new Error("Missing retained mathematical observation.");
    const event = (type: string) => last.featureEvents?.find(event => event.type === type)?.data;
    const bounded = event("boundedMechanics") as BoundedMechanicObservation | undefined;
    const modifiers = event("screenModifiers") as ScreenModifierObservation<string> | undefined;
    const mechanics = blueprint.mechanics;
    const boundedModel = !!(mechanics?.cascade || mechanics?.respins || mechanics?.collection || mechanics?.weightedBonus);
    if (boundedModel !== !!bounded || bounded && (typeof bounded !== "object" || Array.isArray(bounded))) throw new Error("Missing or unexpected retained boundedMechanics observation for artifact model.");
    if (!!mechanics?.modifiers !== !!modifiers || modifiers && (typeof modifiers !== "object" || Array.isArray(modifiers))) throw new Error("Missing or unexpected retained screenModifiers observation for artifact model.");
    for (const retained of last.featureEvents ?? []) {
        if (["boundedMechanics", "screenModifiers", "holdAndWin", "jackpot", "chargedBetMode"].includes(retained.type) &&
            stableSlotMathJson(retained.data ?? {}) !== stableSlotMathJson(projectPublicFeatureEvent(retained).data ?? {})) throw new Error(`Invalid retained ${retained.type} observation fields.`);
    }
    const current = observeVideoSlotFeatures(session);
    const free = mechanics?.freeGames;
    const evaluated = blueprint.screenGeometry ? new ScreenProjection(blueprint.screenGeometry).project(finalScreen, "evaluated") : finalScreen;
    const grant = free ? free.awardsByCount[SymbolsCombinationsAnalyzer.getScatterSymbolsPositions(evaluated, free.scatterSymbol).length] ?? 0 : 0;
    const nativeGrant = (session as Partial<WonFreeGamesNumberDetermining>).getWonFreeGamesNumber?.() ?? 0;
    if (nativeGrant !== grant) throw new Error("Retained freeGamesTriggered grant contradicts its model and evaluated screen.");
    for (const [type, expected] of [["holdAndWin", current.holdAndWin], ["jackpot", current.jackpot],
        ["chargedBetMode", current.chargedBetModeId ? {id: current.chargedBetModeId} : undefined]] as const) {
        const retained = artifacts.flatMap(step => step.featureEvents ?? []).filter(event => event.type === type);
        if (retained.length !== (expected ? 1 : 0) || stableSlotMathJson(event(type)) !== stableSlotMathJson(expected)) throw new Error(`Retained ${type} event contradicts its executable observation.`);
    }
    for (const type of ["boundedMechanics", "screenModifiers"]) {
        if (artifacts.flatMap(step => step.featureEvents ?? []).filter(event => event.type === type).length !== (event(type) ? 1 : 0)) throw new Error(`Duplicate or misplaced retained ${type} event.`);
    }
    if (mechanics?.modifiers) {
        let native = (session as VideoSlotSessionHandling & {toSessionState(): {base?: unknown; modifierState?: ScreenModifierState}}).toSessionState();
        while (native.base) native = native.base as typeof native;
        new ScreenModifierEngine({modifiers: mechanics.modifiers, symbols: blueprint.symbols, wilds: blueprint.wilds ?? [],
            reels: blueprint.reels, rows: blueprint.rows, screenGeometry: blueprint.screenGeometry}).validateObservation(modifiers, native.modifierState!);
    }
    if (bounded) {
        const state = (session as VideoSlotSessionHandling & {toSessionState(): BoundedSessionState}).toSessionState();
        const keys = ["cascade", "respins", "collection"].filter(key => !!Reflect.get(mechanics!, key));
        if (state.bonus?.selection) keys.push("weightedBonus");
        if (Object.keys(bounded).sort().join(",") !== keys.sort().join(",")) throw new Error("Missing or unexpected required bounded feature observation.");
        validateWeightedBonusObservation(state, bounded.weightedBonus);
        if (bounded.weightedBonus) {
            const observed = bounded.weightedBonus;
            const table = mechanics!.weightedBonus!;
            const outcome = table.outcomes.find(outcome => outcome.id === state.bonus!.selection!.outcomeId)!;
            const selectedNow = state.executed === 0;
            if (observed.selectedNow !== selectedNow || observed.payout !== (selectedNow ? weightedBonusPayout(outcome, state.entryBet) : 0) ||
                selectedNow && finalScreen.flat().filter(symbol => symbol === table.trigger.symbolId).length < table.trigger.minimumCount) throw new Error("Weighted bonus observation contradicts its model award and accepted transition.");
        }
        if (mechanics?.respins) {
            const priorRemaining = before?.respinsRemaining;
            if (!Number.isSafeInteger(priorRemaining) || before!.respins !== (priorRemaining! > 0)) throw new Error("Missing accepted respins prior transition.");
            const priorExecuted = priorRemaining! > 0 ? state.executed - 1 : 0;
            const expected = resolveRespinTransition(mechanics.respins, priorRemaining!, priorExecuted,
                finalScreen.flat().filter(symbol => symbol === mechanics.respins!.trigger.symbolId).length);
            if (expected.remaining !== state.remaining || expected.executed !== state.executed ||
                stableSlotMathJson(bounded.respins) !== stableSlotMathJson(expected)) throw new Error("Respins observation contradicts its accepted model transition.");
        }
        if (mechanics?.collection) {
            const observed = bounded.collection!;
            const rule = mechanics.collection;
            const payout = last.wins.filter(win => win.type === "value" && win.symbolId === rule.symbolId).reduce((sum, win) => sum + win.winAmount, 0);
            if (observed.value !== state.value || observed.cap !== rule.cap || observed.threshold !== rule.threshold || observed.reset !== rule.reset ||
                typeof observed.triggered !== "boolean" || observed.payout !== payout || observed.payout !== (observed.triggered ? rule.payout : 0) ||
                observed.contribution !== finalScreen.flat().filter(symbol => symbol === rule.symbolId).length * rule.contribution) throw new Error("Collection observation contradicts executable state, its model or its accepted award.");
        }
        if (bounded.cascade && bounded.cascade.evaluatedSteps !== artifacts.length) throw new Error("Cascade observation contradicts its accepted mathematical steps.");
    }
    const pipelineMetadata = {aggregationPolicy: "sum-all-enabled", evaluators: ["shared-slot-math"]};
    const evaluation = (steps: readonly RoundStepArtifact[], metadata: Record<string, unknown> = pipelineMetadata) => restoreWinEvaluation({
        components: steps.flatMap(step => step.wins.map(win => ({type: win.type, id: win.id, symbolId: win.symbolId as string, amount: win.winAmount,
            positions: win.winningPositions.map(position => [...position]), multipliers: win.multiplierBreakdown.map(item => ({...item, positions: item.positions.map(position => [...position]), values: [...item.values]})), metadata: win.metadata}))), metadata,
    });
    const restored = evaluation(artifacts);
    const hold = session as VideoSlotSessionHandling & {getHoldAndWinLastRoundOutcome?: () => {kind: string}; getJackpotLastRoundOutcome?: () => {kind: string; baseWinEvaluationResult?: WinEvaluationResult}};
    const retainedOutcome = hold.getJackpotLastRoundOutcome?.().kind === "awarded" || hold.getHoldAndWinLastRoundOutcome?.().kind === "completed" || hold.getHoldAndWinLastRoundOutcome?.().kind === "suppressed";
    const expectedAmounts = validateRetainedWins(session, blueprint, artifacts, retainedOutcome, calculator, bounded, before);
    const wrapped = !!blueprint.mechanics?.cascade || bounded?.weightedBonus?.selectedNow || bounded?.collection?.triggered;
    let result = restored;
    if (wrapped) result = new WinEvaluationResult({winComponents: restored.getWinComponents()});
    if (retainedOutcome) result = session.getWinEvaluationResult();
    const legacy = retainedOutcome ? session : undefined;
    const jackpot = hold.getJackpotLastRoundOutcome?.();
    // Jackpot keeps the wrapped legacy display independently of its component-only
    // award evaluation. Its existing executable snapshot already owns that base result.
    const legacyResult = jackpot?.kind === "awarded" ? jackpot.baseWinEvaluationResult! : result;
    const holdOutcome = hold.getHoldAndWinLastRoundOutcome?.();
    const holdLegacy = holdOutcome?.kind === "completed" || holdOutcome?.kind === "suppressed";
    // The legacy fallback displays the underlying ways/cluster amount, whereas the
    // evaluation DTO reports its multiplied component. Zero factors are not invertible:
    // retain those display amounts only after comparison with the model calculation.
    if (mechanics?.modifiers) {
        if (!componentAmounts || Object.keys(componentAmounts).sort().join(",") !== "clusters,ways") throw new Error("Missing accepted component presentation amounts.");
        if (stableSlotMathJson(componentAmounts) !== stableSlotMathJson(expectedAmounts)) throw new Error("Component presentation amounts contradict their model award before multiplication.");
    } else if (componentAmounts) throw new Error("Unexpected component presentation amounts.");
    let cascade: CascadeResult | undefined;
    if (blueprint.mechanics?.cascade) {
        const count = bounded?.cascade?.winningCascades;
        if (!Number.isSafeInteger(count) || count! < 0 || count! > blueprint.mechanics.cascade.maxCascades || artifacts.length !== count! + 1) throw new Error("Invalid retained cascade observation.");
        const stages = artifacts.slice(0, count).map((step, index) => {
            const result = evaluation([step]);
            const removed = result.getWinningPositions();
            const next = artifacts[index + 1].screen as string[][];
            const refill = next.map((reel, index) => reel.slice(0, removed.filter(position => position[0] === index).length));
            if (stableSlotMathJson(new CascadeGridTransformer().collapseAndRefill(step.screen as string[][], removed, refill)) !== stableSlotMathJson(next)) throw new Error("Retained cascade refill contradicts its mathematical screens.");
            return new CascadeStep(step.screen as string[][], result, removed, refill, {cascadeStepIndex: index});
        });
        // Collection replaces the cascade terminal result and its outer metadata.
        const collection = bounded?.collection?.triggered === true;
        const total = stages.reduce((sum, stage) => sum + stage.getWinEvaluationResult().getTotalWin(), 0);
        cascade = new CascadeResult(artifacts[0].screen as string[][], finalScreen, stages, {totalSteps: stages.length}, collection ? {} : {cascadeStepCount: stages.length}, collection ? {} : {totalCascadeWin: total}, evaluation([last]));
    }
    const overrides: Record<string, unknown> = {
        getWinEvaluationResult: () => result,
        getWinAmount: () => win,
        getWinningLines: () => holdLegacy ? session.getWinningLines() : Object.fromEntries(legacyResult.getLineWins().map(c => [c.getId(), c.getWinningLine()])),
        getWinningScatters: () => holdLegacy ? session.getWinningScatters() : Object.fromEntries(legacyResult.getScatterWins().map(c => [c.getSymbolId(), c.getWinningScatter()])),
        getWinningClusters: () => legacy?.getWinningClusters?.() ?? Object.fromEntries(result.getClusterWins().map((c, index) => [c.getId(), componentAmounts ? new WinningCluster(c.getSymbolId()!, c.getWinningPositions(), componentAmounts.clusters[index]) : c.getWinningCluster()])),
        getWinningValues: () => legacy?.getWinningValues?.() ?? Object.fromEntries(result.getValueWins().map(c => [c.getSymbolId(), c.getWinningValue()])),
        getWinningWays: () => legacy?.getWinningWays?.() ?? Object.fromEntries(result.getWaysWins().map((c, index) => [c.getSymbolId(), componentAmounts ? new WinningWay(c.getSymbolId()!, c.getWinningPositions(), c.getWinningWay().getWaysCount(), componentAmounts.ways[index]) : c.getWinningWay()])),
        getSymbolsCombination: () => new SymbolsCombination().fromMatrix(finalScreen),
        getVisibleSymbolsCombination: () => new SymbolsCombination().fromMatrix(last.screen as string[][]),
        getScreenGeometry: () => blueprint.screenGeometry,
        getBoundedMechanicObservation: () => bounded,
        getModifierObservation: () => modifiers,
        ...(cascade ? {getCascadeResult: () => cascade} : {}),
    };
    const observation = new Proxy({} as VideoSlotSessionHandling, {get: (_target, key) => {
        if (typeof key === "string" && key in overrides) return overrides[key];
        const value: unknown = Reflect.get(session, key);
        return typeof value === "function" ? value.bind(session) : value;
    }});
    // Reuse the capture contract only after each observation has its own semantic
    // validation. Generic artifacts allow custom events; canonical portable models
    // can emit exactly this set, on the last mathematical step, in producer order.
    const expectedEvents = deriveStandardFeatureEvents(observation);
    for (const step of artifacts) {
        if (stableSlotMathJson(step.featureEvents ?? []) !== stableSlotMathJson(step === last ? expectedEvents : [])) {
            throw new Error("Retained canonical feature events contradict their executable observations or placement.");
        }
    }
    return observation;
}

/** Compare the complete canonical winning set, using the execution calculator.
 * Native decorators retain authority over their special terminal/suppressed results.
 */
function validateRetainedWins(session: VideoSlotSessionHandling, blueprint: GameBlueprint, steps: readonly RoundStepArtifact[], nativeOutcome: boolean,
    calculator: VideoSlotWinCalculator, bounded: BoundedMechanicObservation | undefined, before?: SessionFeatureAnalyticsBeforePlay): {ways: number[]; clusters: number[]} {
    const amounts = {ways: [] as number[], clusters: [] as number[]};
    for (const [index, step] of steps.entries()) {
        validateArtifactCoordinates(step);
        const combination = new SymbolsCombination().fromMatrix((step.generatedScreen ?? step.screen) as string[][]);
        calculator.calculateWin(session.getBet(), step.geometry ? combination.withCoordinates(step.geometry) : combination);
        let result = calculator.getWinEvaluationResult();
        if (nativeOutcome) {
            const native = session.getWinEvaluationResult();
            const expected = buildRoundStepArtifact(step.index, {screen: step.screen, winEvaluationResult: native,
                ...(step.geometry ? {geometry: step.geometry, generatedScreen: step.generatedScreen} : {})});
            if (stableSlotMathJson(step.wins) !== stableSlotMathJson(expected.wins)) throw new Error("Retained winning set contradicts its native award.");
            // Hold respins deliberately suppress ordinary math, including on completion.
            // Paid entry (even immediate completion) retains its full ordinary winning set.
            const ordinary = blueprint.mechanics?.holdAndWin && before?.hold ? [] : result.getWinComponents();
            result = new WinEvaluationResult({winComponents: [...ordinary, ...native.getWinComponents().filter(component => ["value", "jackpot"].includes(component.getType()))]});
        } else {
            const special: ValueWinComponent[] = [];
            if (index === steps.length - 1) {
                if (bounded?.collection?.triggered) special.push(new ValueWinComponent(new WinningValue(blueprint.mechanics!.collection!.symbolId, [], bounded.collection.payout)));
                if (bounded?.weightedBonus?.selectedNow) special.push(new ValueWinComponent(new WinningValue(blueprint.mechanics!.weightedBonus!.feature.id, [], bounded.weightedBonus.payout)));
            }
            if (special.length) result = new WinEvaluationResult({winComponents: [...result.getWinComponents(), ...special]});
        }
        const expected = buildRoundStepArtifact(step.index, {screen: step.screen, winEvaluationResult: result,
            ...(step.geometry ? {geometry: step.geometry, generatedScreen: step.generatedScreen} : {})});
        if (stableSlotMathJson(step.wins) !== stableSlotMathJson(expected.wins)) throw new Error("Retained winning set or component award contradicts its model, screen, denomination or multipliers.");
        amounts.ways.push(...result.getWaysWins().map(component => component.getWinningWay().getWinAmount()));
        amounts.clusters.push(...result.getClusterWins().map(component => component.getWinningCluster().getWinAmount()));
    }
    return amounts;
}
