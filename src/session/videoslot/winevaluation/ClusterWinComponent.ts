import {WinningClusterDescribing} from "../WinningClusterDescribing.js";
import {WinComponent} from "./WinComponent.js";
import {WinMultiplierBreakdown} from "./WinMultiplierBreakdown.js";

export class ClusterWinComponent<T extends string | number | symbol = string> extends WinComponent<T> {
    private readonly winningCluster: WinningClusterDescribing<T>;

    constructor(
        id: string,
        winningCluster: WinningClusterDescribing<T>,
        winAmount: number = winningCluster.getWinAmount(),
        multiplierBreakdown: WinMultiplierBreakdown[] = [],
    ) {
        super(
            "cluster",
            id,
            winningCluster.getSymbolId(),
            winAmount,
            winningCluster.getSymbolsPositions(),
            multiplierBreakdown,
            {
                symbolsPositions: winningCluster.getSymbolsPositions(),
            },
        );
        this.winningCluster = winningCluster;
    }

    public getWinningCluster(): WinningClusterDescribing<T> {
        return this.winningCluster;
    }
}
