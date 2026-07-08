import {VideoSlotWinDetermining} from "../VideoSlotWinDetermining.js";
import {LegacyWinComponent} from "./LegacyWinComponent.js";
import {WinEvaluationResult} from "./WinEvaluationResult.js";

export class LegacyWinEvaluationResultAdapter {
    public static fromWinCalculator<T extends string | number | symbol = string>(
        winCalculator: VideoSlotWinDetermining<T>,
    ): WinEvaluationResult<T> {
        const winAmount = winCalculator.getWinAmount();
        return new WinEvaluationResult<T>({
            winComponents: winAmount > 0 ? [new LegacyWinComponent<T>(winAmount, {source: "legacy-win-calculator"})] : [],
            metadata: {
                source: "legacy-win-calculator",
                adapted: true,
            },
            auditTrail: [
                {
                    evaluatorId: "legacy",
                    evaluatorGroup: "legacy",
                    componentCount: winAmount > 0 ? 1 : 0,
                    totalWin: winAmount,
                },
            ],
        });
    }
}
