import {WinningScatterDescribing} from "../WinningScatterDescribing.js";
import {WinComponent} from "./WinComponent.js";
import {WinMultiplierBreakdown} from "./WinMultiplierBreakdown.js";

export class ScatterWinComponent<T extends string | number | symbol = string> extends WinComponent<T> {
    private readonly winningScatter: WinningScatterDescribing<T>;

    constructor(
        winningScatter: WinningScatterDescribing<T>,
        winAmount: number = winningScatter.getWinAmount(),
        multiplierBreakdown: WinMultiplierBreakdown[] = [],
    ) {
        super(
            "scatter",
            String(winningScatter.getSymbolId()),
            winningScatter.getSymbolId(),
            winAmount,
            winningScatter.getSymbolsPositions(),
            multiplierBreakdown,
            {
                symbolsPositions: winningScatter.getSymbolsPositions(),
            },
        );
        this.winningScatter = winningScatter;
    }

    public getWinningScatter(): WinningScatterDescribing<T> {
        return this.winningScatter;
    }
}
