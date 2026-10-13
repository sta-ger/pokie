import type {VideoSlotRoundNetworkData, WinEvaluationResultNetworkData} from "./VideoSlotNetworkData.js";
import {ScreenProjection} from "../../session/videoslot/coordinates/ScreenProjection.js";
import {projectVisibleLine, projectVisiblePositions} from "../../session/videoslot/coordinates/projectVisibleWinData.js";
import type {ScreenGeometry} from "../../session/videoslot/coordinates/ScreenGeometry.js";

/** Takes already-settled evaluation data. Projection never recalculates a win. */
export function projectVideoSlotNetworkData<T extends string | number | symbol>(data: VideoSlotRoundNetworkData<T>, geometry: ScreenGeometry): VideoSlotRoundNetworkData<T> {
    const projection = new ScreenProjection(geometry);
    projection.assertMatrix(data.reelsSymbols, "visible");
    if (projection.isIdentity()) return data;
    const projectPositions = (positions: number[][]) => projectVisiblePositions(positions, projection);
    const result = {...data, visibleRowCoverage: projection.getVisibleCoverage()};
    if (data.winningPositions) result.winningPositions = projectPositions(data.winningPositions);
    if (data.winningLines) {
        result.winningLines = Object.fromEntries(Object.entries(data.winningLines).flatMap(([id, line]) => {
            const mapped = projectVisibleLine(line, projection);
            return mapped ? [[id, mapped]] : [];
        }));
    }
    for (const key of ["winningScatters", "winningClusters", "winningValues", "winningWays"] as const) {
        const records = data[key];
        if (records) Object.assign(result, {[key]: Object.fromEntries(Object.entries(records).map(([id, win]) => {
            const value = win as {symbolsPositions: number[][]};
            return [id, {...value, symbolsPositions: projectPositions(value.symbolsPositions)}];
        }))});
    }
    if (data.winEvaluationResult) result.winEvaluationResult = projectWinEvaluationResultNetworkData(data.winEvaluationResult, geometry);
    return result;
}

/** Explicit evaluation-to-viewport mapping, also used by direct win-result serialization. */
export function projectWinEvaluationResultNetworkData<T extends string | number | symbol>(evaluation: WinEvaluationResultNetworkData<T>, geometry: ScreenGeometry): WinEvaluationResultNetworkData<T> {
    const projection = new ScreenProjection(geometry);
    if (projection.isIdentity()) return evaluation;
    const projectPositions = (positions: number[][]) => projectVisiblePositions(positions, projection);
    return {
        ...evaluation,
        winningPositions: projectPositions(evaluation.winningPositions),
        lineWins: evaluation.lineWins.map(line => projectVisibleLine(line, projection)),
        scatterWins: evaluation.scatterWins.map(win => ({...win, symbolsPositions: projectPositions(win.symbolsPositions)})),
        clusterWins: evaluation.clusterWins.map(win => ({...win, symbolsPositions: projectPositions(win.symbolsPositions)})),
        valueWins: evaluation.valueWins.map(win => ({...win, symbolsPositions: projectPositions(win.symbolsPositions)})),
        waysWins: evaluation.waysWins.map(win => ({...win, symbolsPositions: projectPositions(win.symbolsPositions)})),
    };
}
