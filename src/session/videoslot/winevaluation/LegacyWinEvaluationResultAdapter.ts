import {SymbolsCombinationsAnalyzer} from "../combinations/SymbolsCombinationsAnalyzer.js";
import {VideoSlotWinDetermining} from "../VideoSlotWinDetermining.js";
import {WinningScatterDescribing} from "../WinningScatterDescribing.js";
import {LegacyWinComponent} from "./LegacyWinComponent.js";
import {LineWinComponent} from "./LineWinComponent.js";
import {ScatterWinComponent} from "./ScatterWinComponent.js";
import {WinEvaluationResult} from "./WinEvaluationResult.js";

export class LegacyWinEvaluationResultAdapter {
    public static fromWinCalculator<T extends string | number | symbol = string>(
        winCalculator: VideoSlotWinDetermining<T>,
    ): WinEvaluationResult<T> {
        const winAmount = winCalculator.getWinAmount();
        const lineWins = Object.values(winCalculator.getWinningLines()).map(
            (line) =>
                new LineWinComponent<T>(
                    line,
                    SymbolsCombinationsAnalyzer.getLineSymbolsGridPositions(line.getDefinition(), line.getSymbolsPositions()),
                ),
        );
        const scatterWins = Object.values<WinningScatterDescribing<T>>(winCalculator.getWinningScatters()).map(
            (scatter) => new ScatterWinComponent<T>(scatter),
        );
        // Some legacy calculators report a total that isn't fully explained by their own
        // winningLines/winningScatters records (e.g. a custom global multiplier). Any unaccounted
        // amount is preserved as an opaque component so getTotalWin() never silently drops win.
        const accountedAmount = [...lineWins, ...scatterWins].reduce((sum, component) => sum + component.getWinAmount(), 0);
        const unaccountedAmount = winAmount - accountedAmount;
        const legacyRemainder =
            unaccountedAmount > 0 ? [new LegacyWinComponent<T>(unaccountedAmount, {source: "legacy-win-calculator"})] : [];
        return new WinEvaluationResult<T>({
            lineWins,
            scatterWins,
            winComponents: [...lineWins, ...scatterWins, ...legacyRemainder],
            metadata: {
                source: "legacy-win-calculator",
                adapted: true,
            },
            auditTrail: [
                {
                    evaluatorId: "legacy",
                    evaluatorGroup: "legacy",
                    componentCount: lineWins.length + scatterWins.length + legacyRemainder.length,
                    totalWin: winAmount,
                },
            ],
        });
    }
}
