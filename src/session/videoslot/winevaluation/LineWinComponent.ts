import {WinningLineDescribing} from "../WinningLineDescribing.js";
import {WinComponent} from "./WinComponent.js";
import {WinMultiplierBreakdown} from "./WinMultiplierBreakdown.js";

export class LineWinComponent<T extends string | number | symbol = string> extends WinComponent<T> {
    private readonly winningLine: WinningLineDescribing<T>;

    constructor(
        winningLine: WinningLineDescribing<T>,
        winningPositions: number[][],
        winAmount: number = winningLine.getWinAmount(),
        multiplierBreakdown: WinMultiplierBreakdown[] = [],
    ) {
        super(
            "line",
            winningLine.getLineId(),
            winningLine.getSymbolId(),
            winAmount,
            winningPositions,
            multiplierBreakdown,
            {
                definition: winningLine.getDefinition(),
                pattern: winningLine.getPattern(),
                symbolsPositions: winningLine.getSymbolsPositions(),
                wildSymbolsPositions: winningLine.getWildSymbolsPositions(),
            },
        );
        this.winningLine = winningLine;
    }

    public getWinningLine(): WinningLineDescribing<T> {
        return this.winningLine;
    }
}
