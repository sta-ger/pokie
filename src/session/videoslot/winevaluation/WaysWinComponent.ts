import {WinningWayDescribing} from "../WinningWayDescribing.js";
import {WinComponent} from "./WinComponent.js";
import {WinMultiplierBreakdown} from "./WinMultiplierBreakdown.js";

export class WaysWinComponent<T extends string | number | symbol = string> extends WinComponent<T> {
    private readonly winningWay: WinningWayDescribing<T>;

    constructor(
        winningWay: WinningWayDescribing<T>,
        winAmount: number = winningWay.getWinAmount(),
        multiplierBreakdown: WinMultiplierBreakdown[] = [],
    ) {
        super(
            "ways",
            String(winningWay.getSymbolId()),
            winningWay.getSymbolId(),
            winAmount,
            winningWay.getSymbolsPositions(),
            multiplierBreakdown,
            {
                symbolsPositions: winningWay.getSymbolsPositions(),
                waysCount: winningWay.getWaysCount(),
            },
        );
        this.winningWay = winningWay;
    }

    public getWinningWay(): WinningWayDescribing<T> {
        return this.winningWay;
    }
}
