import type {WinEvaluationResult} from "../../session/videoslot/winevaluation/WinEvaluationResult.js";
import type {WinEvaluationResultNetworkData} from "./VideoSlotNetworkData.js";

// Extracted from VideoSlotSessionSerializer (which still uses it for a round's own win result) so
// CascadeSessionSerializer can reuse the same mapping for each cascade step's win result instead of
// duplicating it.
export function serializeWinEvaluationResult<T extends string | number | symbol = string>(
    result: WinEvaluationResult<T>,
): WinEvaluationResultNetworkData<T> {
    return {
        totalWin: result.getTotalWin(),
        winningPositions: result.getWinningPositions(),
        lineWins: result.getLineWins().map((component) => {
            const line = component.getWinningLine();
            return {
                definition: line.getDefinition(),
                pattern: line.getPattern(),
                symbolId: line.getSymbolId(),
                lineId: line.getLineId(),
                symbolsPositions: line.getSymbolsPositions(),
                wildSymbolsPositions: line.getWildSymbolsPositions(),
                winAmount: component.getWinAmount(),
            };
        }),
        scatterWins: result.getScatterWins().map((component) => ({
            symbolId: component.getWinningScatter().getSymbolId(),
            symbolsPositions: component.getWinningScatter().getSymbolsPositions(),
            winAmount: component.getWinAmount(),
        })),
        clusterWins: result.getClusterWins().map((component) => ({
            symbolId: component.getWinningCluster().getSymbolId(),
            symbolsPositions: component.getWinningCluster().getSymbolsPositions(),
            winAmount: component.getWinAmount(),
        })),
        valueWins: result.getValueWins().map((component) => ({
            symbolId: component.getWinningValue().getSymbolId(),
            symbolsPositions: component.getWinningValue().getSymbolsPositions(),
            winAmount: component.getWinAmount(),
        })),
        waysWins: result.getWaysWins().map((component) => ({
            symbolId: component.getWinningWay().getSymbolId(),
            symbolsPositions: component.getWinningWay().getSymbolsPositions(),
            waysCount: component.getWinningWay().getWaysCount(),
            winAmount: component.getWinAmount(),
        })),
        metadata: result.getMetadata(),
    };
}
