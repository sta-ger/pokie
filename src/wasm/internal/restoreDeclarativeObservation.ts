import {validateArtifactCoordinates} from "../../artifact/validateArtifactCoordinates.js";
import {buildRoundStepArtifact} from "../../artifact/buildRoundStepArtifact.js";
import {deriveStandardFeatureEvents} from "../../artifact/buildRoundArtifactFromSession.js";
import {SymbolsCombinationsAnalyzer} from "../../session/videoslot/combinations/SymbolsCombinationsAnalyzer.js";
import type {WonFreeGamesNumberDetermining} from "../../session/WonFreeGamesNumberDetermining.js";
import {MultiplierResolver} from "../../session/videoslot/winevaluation/MultiplierResolver.js";
import {WinEvaluationContext} from "../../session/videoslot/winevaluation/WinEvaluationContext.js";
import {ScreenModifierEngine} from "../../session/videoslot/modifiers/ScreenModifierEngine.js";
import {observeVideoSlotFeatures} from "../../net/videoslot/observeVideoSlotFeatures.js";
import {projectPublicFeatureEvent} from "../../artifact/PublicRoundArtifactProjector.js";
import {validateWeightedBonusObservation} from "../../session/videoslot/authored/WeightedBonus.js";
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
import type {BoundedMechanicObservation} from "../../session/videoslot/authored/BoundedMechanics.js";
import type {ScreenModifierObservation, ScreenModifierState} from "../../session/videoslot/modifiers/ScreenModifiers.js";
import {stableSlotMathJson} from "../math/SharedSlotMath.js";
import {ScreenProjection} from "../../session/videoslot/coordinates/ScreenProjection.js";

/** Rehydrate accepted observations for the existing serializers/analytics observer.
 * No evaluator, RNG, wallet effect or session-prefix replay is involved.
 */
export function restoreDeclarativeObservation(session: VideoSlotSessionHandling, blueprint: GameBlueprint, artifacts: readonly RoundStepArtifact[], finalScreen: string[][], win: number, componentAmounts: PokieWasmFeatureSessionState["feature"]["componentAmounts"]): VideoSlotSessionHandling {
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
            const payouts = last.wins.filter(win => win.type === "value" && win.id === mechanics!.weightedBonus!.feature.id);
            if (typeof bounded.weightedBonus.selectedNow !== "boolean" || bounded.weightedBonus.selectedNow !== (payouts.length > 0) ||
                bounded.weightedBonus.payout !== payouts.reduce((sum, win) => sum + win.winAmount, 0)) throw new Error("Weighted bonus observation contradicts its accepted award.");
        }
        if (mechanics?.respins) {
            const observed = bounded.respins!;
            if (observed.remaining !== state.remaining || observed.executed !== state.executed || observed.limit !== mechanics.respins.maxRespins ||
                !Number.isSafeInteger(observed.granted) || observed.granted < 0 || observed.granted > observed.remaining) throw new Error("Respins observation contradicts executable state or its model.");
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
    validateRetainedWins(session, blueprint, artifacts, retainedOutcome);
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
    // retain just those accepted base amounts, never recalculate a paytable award.
    if (mechanics?.modifiers) {
        if (!componentAmounts || Object.keys(componentAmounts).sort().join(",") !== "clusters,ways") throw new Error("Missing accepted component presentation amounts.");
        for (const [type, components, amounts] of [["ways", result.getWaysWins(), componentAmounts.ways], ["cluster", result.getClusterWins(), componentAmounts.clusters]] as const) {
            if (!Array.isArray(amounts) || amounts.length !== components.length) throw new Error("Invalid accepted component presentation amounts.");
            const wins = artifacts.flatMap(step => step.wins.filter(win => win.type === type));
            for (const [index, amount] of amounts.entries()) {
                const win = wins[index];
                const factor = win.multiplierBreakdown.reduce((factor, item) => factor * item.combinedMultiplier, 1);
                if (!Number.isFinite(amount) || amount < 0 || !Number.isFinite(factor) || amount * factor !== win.winAmount) throw new Error("Component presentation amount contradicts its accepted multiplier attribution.");
            }
        }
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

/** Attribution validation only: amounts stay owned by the accepted evaluation.
 * Uses the existing coordinate and multiplier contracts, without evaluating paytables.
 */
function validateRetainedWins(session: VideoSlotSessionHandling, blueprint: GameBlueprint, steps: readonly RoundStepArtifact[], nativeOutcome: boolean): void {
    if (nativeOutcome) {
        const native = buildRoundStepArtifact(0, {screen: steps[0].screen, winEvaluationResult: session.getWinEvaluationResult(),
            ...(steps[0].geometry ? {geometry: steps[0].geometry, generatedScreen: steps[0].generatedScreen} : {})});
        if (stableSlotMathJson(steps.flatMap(step => step.wins)) !== stableSlotMathJson(native.wins)) throw new Error("Retained win attribution contradicts its executable award.");
    }
    const factors = Object.fromEntries((blueprint.mechanics?.modifiers?.wilds ?? []).filter(wild => wild.factor !== undefined).map(wild => [wild.symbol, wild.factor!]));
    const resolver = new MultiplierResolver(factors, {source: "authored-wild-product", uniquePositions: true, supportedComponentTypes: ["line", "ways", "cluster"]});
    for (const step of steps) {
        validateArtifactCoordinates(step);
        const combination = new SymbolsCombination().fromMatrix((step.generatedScreen ?? step.screen) as string[][]);
        const tagged = step.geometry ? combination.withCoordinates(step.geometry) : combination;
        const context = new WinEvaluationContext(session.getBet(), tagged, session);
        const matrix = context.getSymbolsCombination().toMatrix();
        for (const win of step.wins) {
            const invalid = () => new Error(`Retained win ${win.type}.${win.id} contradicts its model, screen or multiplier attribution.`);
            // Native decorators own their special award attribution. Their ordinary base
            // components still have to satisfy the model/screen checks below.
            if (nativeOutcome && ["value", "jackpot"].includes(win.type)) continue;
            const symbol = win.symbolId;
            if (typeof symbol !== "string") throw invalid();
            const bonusAward = win.type === "value" && symbol === blueprint.mechanics?.weightedBonus?.feature.id;
            const collectionAward = win.type === "value" && symbol === blueprint.mechanics?.collection?.symbolId;
            if (bonusAward || collectionAward) {
                if (win.id !== symbol || win.winningPositions.length || win.multiplierBreakdown.length) throw invalid();
                continue;
            }
            if (!blueprint.symbols.includes(symbol) || !win.winningPositions.length || new Set(win.winningPositions.map(position => JSON.stringify(position))).size !== win.winningPositions.length) throw invalid();
            const matches = (actual: string) => actual === symbol || (blueprint.wilds?.includes(actual) &&
                win.type !== "scatter" && (blueprint.mechanics?.modifiers?.wilds.find(wild => wild.symbol === actual)?.substitutes?.includes(symbol) ?? true));
            if (win.winningPositions.some(([reel, row]) => !matches(matrix[reel]?.[row]))) throw invalid();
            const count = win.type === "ways" ? new Set(win.winningPositions.map(([reel]) => reel)).size : win.winningPositions.length;
            if (!(blueprint.paytable[symbol]?.[count] > 0) || win.type !== "scatter" && blueprint.wilds?.includes(symbol) || ["line", "ways"].includes(win.type) && blueprint.scatters?.includes(symbol)) throw invalid();
            if (win.type === "line") {
                if ((blueprint.winModel?.type ?? "lines") !== "lines" || !session.getLinesDefinitions().getLinesIds().includes(win.id)) throw invalid();
                const definition = session.getLinesDefinitions().getLineDefinition(win.id);
                const reels = win.winningPositions.map(([reel]) => reel);
                const metadata = {definition, pattern: Array.from({length: blueprint.reels}, (_, reel) => reels.includes(reel) ? 1 : 0),
                    symbolsPositions: reels, wildSymbolsPositions: win.winningPositions.filter(([reel, row]) => blueprint.wilds?.includes(matrix[reel][row])).map(([reel]) => reel)};
                if (win.winningPositions.some(([reel, row], index) => reel !== index || definition[reel] !== row) || stableSlotMathJson(win.metadata) !== stableSlotMathJson(metadata)) throw invalid();
            } else if (win.type === "scatter") {
                const positions = matrix.flatMap((reel, r) => reel.flatMap((actual, row) => actual === symbol ? [[r, row]] : []));
                if (!blueprint.scatters?.includes(symbol) || win.id !== symbol || stableSlotMathJson(positions) !== stableSlotMathJson(win.winningPositions)) throw invalid();
            } else if (win.type === "ways") {
                if (blueprint.winModel?.type !== "ways" || win.id !== symbol) throw invalid();
                const positions = matrix.slice(0, count).flatMap((reel, r) => reel.flatMap((actual, row) => matches(actual) ? [[r, row]] : []));
                const ways = Array.from({length: count}, (_, reel) => positions.filter(position => position[0] === reel).length).reduce((product, size) => product * size, 1);
                if (stableSlotMathJson(positions) !== stableSlotMathJson(win.winningPositions) || win.metadata.waysCount !== ways || stableSlotMathJson(win.metadata.symbolsPositions) !== stableSlotMathJson(positions)) throw invalid();
            } else if (win.type === "cluster") {
                if (blueprint.winModel?.type !== "clusters" || !(/^(0|[1-9][0-9]*)$/).test(win.id) || Number(win.id) >= blueprint.reels * matrix[0].length ||
                    count < (blueprint.winModel.minimumClusterSize ?? 5) || stableSlotMathJson(win.metadata.symbolsPositions) !== stableSlotMathJson(win.winningPositions)) throw invalid();
                const cells = new Set(win.winningPositions.map(([reel, row]) => `${reel}:${row}`));
                const connected = new Set<string>();
                const pending = [win.winningPositions[0]];
                while (pending.length) {
                    const [reel, row] = pending.pop()!;
                    const key = `${reel}:${row}`;
                    if (connected.has(key)) continue;
                    connected.add(key);
                    for (const position of [[reel - 1, row], [reel + 1, row], [reel, row - 1], [reel, row + 1]]) {
                        const neighbor = `${position[0]}:${position[1]}`;
                        if (cells.has(neighbor) && !connected.has(neighbor)) pending.push(position);
                    }
                }
                if (connected.size !== count) throw invalid();
            } else throw invalid();
            const component = restoreWinEvaluation({components: [{type: win.type, id: win.id, symbolId: symbol, amount: 0, positions: win.winningPositions as number[][], multipliers: [], metadata: win.metadata}], metadata: {}}).getWinComponents()[0];
            const expected = blueprint.mechanics?.modifiers && resolver.supportsComponentType(win.type) ? resolver.resolve(component, context).breakdown : [];
            if (stableSlotMathJson(win.multiplierBreakdown) !== stableSlotMathJson(expected)) throw invalid();
        }
    }
}
