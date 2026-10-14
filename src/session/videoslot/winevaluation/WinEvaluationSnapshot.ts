import {WinComponent} from "./WinComponent.js";
import {WinEvaluationResult} from "./WinEvaluationResult.js";
import {LineWinComponent} from "./LineWinComponent.js";
import {ScatterWinComponent} from "./ScatterWinComponent.js";
import {ValueWinComponent} from "./ValueWinComponent.js";
import {ClusterWinComponent} from "./ClusterWinComponent.js";
import {WaysWinComponent} from "./WaysWinComponent.js";
import {WinningLine} from "../WinningLine.js";
import {WinningScatter} from "../WinningScatter.js";
import {WinningCluster} from "../WinningCluster.js";
import {WinningValue} from "../WinningValue.js";
import {WinningWay} from "../WinningWay.js";
import type {WinMultiplierBreakdown} from "./WinMultiplierBreakdown.js";

export type WinEvaluationSnapshot<T extends string | number | symbol = string> = {
    components: {type: string; id: string; symbolId: T; amount: number; positions: number[][]; multipliers: WinMultiplierBreakdown[]; metadata: Record<string, unknown>}[];
    metadata: Record<string, unknown>;
};

export function captureWinEvaluation<T extends string | number | symbol>(result: WinEvaluationResult<T>): WinEvaluationSnapshot<T> {
    return {components: result.getWinComponents().map(c => ({type: c.getType(), id: c.getId(), symbolId: (c.getSymbolId() ?? null) as T, amount: c.getWinAmount(), positions: c.getWinningPositions(), multipliers: c.getMultiplierBreakdown(), metadata: c.getMetadata()})), metadata: result.getMetadata()};
}

class RetainedWinComponent<T extends string | number | symbol> extends WinComponent<T> {
    constructor(c: WinEvaluationSnapshot<T>["components"][number]) {
        super(c.type, c.id, c.symbolId, c.amount, c.positions, c.multipliers, c.metadata);
    }
}

/** Restore already-settled data; never calculate, credit or draw. */
export function restoreWinEvaluation<T extends string | number | symbol>(snapshot: WinEvaluationSnapshot<T>): WinEvaluationResult<T> {
    if (!snapshot || !Array.isArray(snapshot.components) || !snapshot.metadata || typeof snapshot.metadata !== "object") throw new Error("Invalid retained win evaluation.");
    for (const c of snapshot.components) if (!c || typeof c.type !== "string" || typeof c.id !== "string" || !Number.isFinite(c.amount) || c.amount < 0 || !Array.isArray(c.positions) || !c.positions.every(p => Array.isArray(p) && p.length === 2 && p.every(n => Number.isSafeInteger(n) && n >= 0)) || !Array.isArray(c.multipliers) || !c.metadata || typeof c.metadata !== "object") throw new Error("Invalid retained win component.");
    const lines: LineWinComponent<T>[] = [],
        scatters: ScatterWinComponent<T>[] = [],
        clusters: ClusterWinComponent<T>[] = [],
        values: ValueWinComponent<T>[] = [],
        ways: WaysWinComponent<T>[] = [];
    const components = snapshot.components.map(c => {
        let component: WinComponent<T>;
        if (c.type === "line") {
            const m = c.metadata as {definition: number[]; pattern: number[]; symbolsPositions: number[]; wildSymbolsPositions: number[]};
            component = new LineWinComponent(new WinningLine(c.amount, m.definition, m.pattern, c.id, m.symbolsPositions, m.wildSymbolsPositions, c.symbolId), c.positions, c.amount, c.multipliers);
            lines.push(component as LineWinComponent<T>);
        } else if (c.type === "scatter") {
            component = new ScatterWinComponent(new WinningScatter(c.symbolId, c.positions, c.amount));
            scatters.push(component as ScatterWinComponent<T>);
        } else if (c.type === "cluster") {
            component = new ClusterWinComponent(c.id, new WinningCluster(c.symbolId, c.positions, c.amount));
            clusters.push(component as ClusterWinComponent<T>);
        } else if (c.type === "value") {
            component = new ValueWinComponent(new WinningValue(c.symbolId, c.positions, c.amount));
            values.push(component as ValueWinComponent<T>);
        } else if (c.type === "ways") {
            component = new WaysWinComponent(new WinningWay(c.symbolId, c.positions, Number(c.metadata.waysCount), c.amount));
            ways.push(component as WaysWinComponent<T>);
        } else component = new RetainedWinComponent(c);
        return new RetainedWinComponent(c);
    });
    return new WinEvaluationResult({lineWins: lines, scatterWins: scatters, clusterWins: clusters, valueWins: values, waysWins: ways, winComponents: components, metadata: snapshot.metadata});
}
