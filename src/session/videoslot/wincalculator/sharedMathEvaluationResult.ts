import {WinningLine} from "../WinningLine.js";
import {WinningScatter} from "../WinningScatter.js";
import {WinningWay} from "../WinningWay.js";
import {WinningCluster} from "../WinningCluster.js";
import {LineWinComponent} from "../winevaluation/LineWinComponent.js";
import {ScatterWinComponent} from "../winevaluation/ScatterWinComponent.js";
import {WaysWinComponent} from "../winevaluation/WaysWinComponent.js";
import {ClusterWinComponent} from "../winevaluation/ClusterWinComponent.js";
import {WinEvaluationResult} from "../winevaluation/WinEvaluationResult.js";
import type {SharedSlotMathModel, SharedSlotMathResult} from "../../../wasm/math/SharedSlotMath.js";
/** Attribution only: selection, positions, amounts and order come from the shared executable. */
export function sharedMathEvaluationResult(model: SharedSlotMathModel, result: SharedSlotMathResult, lineIds?: readonly string[]): WinEvaluationResult<string> {
    const lineWins: LineWinComponent<string>[] = [],
        scatterWins: ScatterWinComponent<string>[] = [];
    const waysWins: WaysWinComponent<string>[] = [],
        clusterWins: ClusterWinComponent<string>[] = [];
    for (const item of result.components) {
        if (item.kind === 0) {
            const definition = [...model.paylines[item.id]];
            const reels = item.positions.map(([reel]) => reel);
            const pattern = Array.from({length: model.reels}, (_, reel) => reels.includes(reel) ? 1 : 0);
            const wilds = item.positions.filter(([reel, row]) => model.wilds?.includes(result.screen[reel][row])).map(([reel]) => reel);
            lineWins.push(new LineWinComponent(new WinningLine(item.amount, definition, pattern, lineIds?.[item.id] ?? String(item.id), reels, wilds, item.symbol), item.positions));
        } else if (item.kind === 1) scatterWins.push(new ScatterWinComponent(new WinningScatter(item.symbol, item.positions, item.amount)));
        else if (item.kind === 2) waysWins.push(new WaysWinComponent(new WinningWay(item.symbol, item.positions, item.ways, item.amount)));
        else clusterWins.push(new ClusterWinComponent(String(item.id), new WinningCluster(item.symbol, item.positions, item.amount)));
    }
    return new WinEvaluationResult({lineWins, scatterWins, waysWins, clusterWins});
}
