import {WinningValueDescribing} from "../WinningValueDescribing.js";
import {WinComponent} from "./WinComponent.js";
import {WinMultiplierBreakdown} from "./WinMultiplierBreakdown.js";

export class ValueWinComponent<T extends string | number | symbol = string> extends WinComponent<T> {
    private readonly winningValue: WinningValueDescribing<T>;

    constructor(
        winningValue: WinningValueDescribing<T>,
        winAmount: number = winningValue.getWinAmount(),
        multiplierBreakdown: WinMultiplierBreakdown[] = [],
    ) {
        super(
            "value",
            String(winningValue.getSymbolId()),
            winningValue.getSymbolId(),
            winAmount,
            winningValue.getSymbolsPositions(),
            multiplierBreakdown,
            {
                symbolsPositions: winningValue.getSymbolsPositions(),
            },
        );
        this.winningValue = winningValue;
    }

    public getWinningValue(): WinningValueDescribing<T> {
        return this.winningValue;
    }
}
