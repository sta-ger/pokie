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
import type {ScreenModifierObservation} from "../../session/videoslot/modifiers/ScreenModifiers.js";
import {stableSlotMathJson} from "../math/SharedSlotMath.js";

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
    return new Proxy({} as VideoSlotSessionHandling, {get: (_target, key) => {
        if (typeof key === "string" && key in overrides) return overrides[key];
        const value: unknown = Reflect.get(session, key);
        return typeof value === "function" ? value.bind(session) : value;
    }});
}
