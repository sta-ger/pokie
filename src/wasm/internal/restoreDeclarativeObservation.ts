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
export function restoreDeclarativeObservation(session: VideoSlotSessionHandling, blueprint: GameBlueprint, artifacts: readonly RoundStepArtifact[], finalScreen: string[][], win: number): VideoSlotSessionHandling {
    const last = artifacts[artifacts.length - 1];
    if (!last) throw new Error("Missing retained mathematical observation.");
    const event = (type: string) => last.featureEvents?.find(event => event.type === type)?.data;
    const bounded = event("boundedMechanics") as BoundedMechanicObservation | undefined;
    const modifiers = event("screenModifiers") as ScreenModifierObservation<string> | undefined;
    const mechanics = blueprint.mechanics;
    if ((mechanics?.cascade || mechanics?.respins || mechanics?.collection || mechanics?.weightedBonus) && !bounded || mechanics?.modifiers && !modifiers) throw new Error("Missing required retained feature observation.");
    const pipelineMetadata = {aggregationPolicy: "sum-all-enabled", evaluators: ["shared-slot-math"]};
    const evaluation = (steps: readonly RoundStepArtifact[], metadata: Record<string, unknown> = pipelineMetadata) => restoreWinEvaluation({
        components: steps.flatMap(step => step.wins.map(win => ({type: win.type, id: win.id, symbolId: win.symbolId as string, amount: win.winAmount,
            positions: win.winningPositions.map(position => [...position]), multipliers: win.multiplierBreakdown.map(item => ({...item, positions: item.positions.map(position => [...position]), values: [...item.values]})), metadata: win.metadata}))), metadata,
    });
    const restored = evaluation(artifacts);
    const hold = session as VideoSlotSessionHandling & {getHoldAndWinLastRoundOutcome?: () => {kind: string}; getJackpotLastRoundOutcome?: () => {kind: string}};
    const retainedOutcome = hold.getJackpotLastRoundOutcome?.().kind === "awarded" || hold.getHoldAndWinLastRoundOutcome?.().kind === "completed" || hold.getHoldAndWinLastRoundOutcome?.().kind === "suppressed";
    const wrapped = !!blueprint.mechanics?.cascade || bounded?.weightedBonus?.selectedNow || bounded?.collection?.triggered;
    let result = restored;
    if (wrapped) result = new WinEvaluationResult({winComponents: restored.getWinComponents()});
    if (retainedOutcome) result = session.getWinEvaluationResult();
    const legacy = retainedOutcome ? session : undefined;
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
        getWinningLines: () => legacy?.getWinningLines() ?? Object.fromEntries(result.getLineWins().map(c => [c.getId(), c.getWinningLine()])),
        getWinningScatters: () => legacy?.getWinningScatters() ?? Object.fromEntries(result.getScatterWins().map(c => [c.getSymbolId(), c.getWinningScatter()])),
        getWinningClusters: () => legacy?.getWinningClusters?.() ?? Object.fromEntries(result.getClusterWins().map(c => [c.getId(), c.getWinningCluster()])),
        getWinningValues: () => legacy?.getWinningValues?.() ?? Object.fromEntries(result.getValueWins().map(c => [c.getSymbolId(), c.getWinningValue()])),
        getWinningWays: () => legacy?.getWinningWays?.() ?? Object.fromEntries(result.getWaysWins().map(c => [c.getSymbolId(), c.getWinningWay()])),
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
