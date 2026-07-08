import {
    ClusterWinCalculating,
    DefaultLineWinCalculator,
    DefaultScatterWinCalculator,
    LineWinCalculating,
    ScatterWinCalculating,
    SymbolsCombinationDescribing,
    ValueWinCalculating,
    VideoSlotConfigDescribing,
    VideoSlotWinCalculating,
    WinningClusterDescribing,
    WinningLineDescribing,
    WinningScatter,
    WinningScatterDescribing,
    WinningValueDescribing,
} from "pokie";

export class VideoSlotWinCalculator<T extends string | number | symbol = string> implements VideoSlotWinCalculating<T> {
    private readonly config: VideoSlotConfigDescribing<T>;
    private readonly lineWinCalculator: LineWinCalculating<T>;
    private readonly scatterWinCalculator: ScatterWinCalculating<T>;
    private readonly clusterWinCalculator?: ClusterWinCalculating<T>;
    private readonly valueWinCalculator?: ValueWinCalculating<T>;

    private winningLines: Record<string, WinningLineDescribing<T>> = {};
    private winningScatters: Record<T, WinningScatterDescribing<T>> = {} as Record<T, WinningScatterDescribing<T>>;
    private winningClusters: Record<string, WinningClusterDescribing<T>> = {};
    private winningValues: Record<T, WinningValueDescribing<T>> = {} as Record<T, WinningValueDescribing<T>>;

    constructor(
        conf: VideoSlotConfigDescribing<T>,
        lineWinCalculator: LineWinCalculating<T> = new DefaultLineWinCalculator<T>(conf),
        scatterWinCalculator: ScatterWinCalculating<T> = new DefaultScatterWinCalculator<T>(conf),
        // Left undefined by default (rather than defaulting to a DefaultClusterWinCalculator
        // instance) so calculateWin() below only computes cluster wins when a caller opts in —
        // existing callers that never pass this argument see no change in behavior or winAmount.
        clusterWinCalculator: ClusterWinCalculating<T> | undefined = undefined,
        // Same reasoning as clusterWinCalculator above — no default instance, opt-in only.
        valueWinCalculator: ValueWinCalculating<T> | undefined = undefined,
    ) {
        this.config = conf;
        this.lineWinCalculator = lineWinCalculator;
        this.scatterWinCalculator = scatterWinCalculator;
        this.clusterWinCalculator = clusterWinCalculator;
        this.valueWinCalculator = valueWinCalculator;
    }

    public calculateWin(bet: number, symbolsCombination: SymbolsCombinationDescribing<T>): void {
        if (this.config.getAvailableBets().some((availableBet) => availableBet === bet)) {
            this.winningLines = this.lineWinCalculator.calculateWinningLines(bet, symbolsCombination);
            this.winningScatters = this.scatterWinCalculator.calculateWinningScatters(bet, symbolsCombination);
            this.winningClusters = this.clusterWinCalculator?.calculateWinningClusters(bet, symbolsCombination) ?? {};
            this.winningValues =
                this.valueWinCalculator?.calculateWinningValues(bet, symbolsCombination) ??
                ({} as Record<T, WinningValueDescribing<T>>);
        } else {
            throw new Error(`Bet ${bet} is not specified at paytable`);
        }
    }

    public getWinningLines(): Record<string, WinningLineDescribing<T>> {
        return this.winningLines;
    }

    public getWinningScatters(): Record<T, WinningScatterDescribing<T>> {
        return this.winningScatters;
    }

    public getWinningClusters(): Record<string, WinningClusterDescribing<T>> {
        return this.winningClusters;
    }

    public getWinningValues(): Record<T, WinningValueDescribing<T>> {
        return this.winningValues;
    }

    public getWinAmount(): number {
        return this.getLinesWinning() + this.getScattersWinning() + this.getClustersWinning() + this.getValuesWinning();
    }

    public getLinesWinning(): number {
        return Object.values(this.getWinningLines()).reduce((sum, line) => sum + line.getWinAmount(), 0);
    }

    public getScattersWinning(): number {
        // Object.values() on a Record keyed by a generic type parameter loses its value type,
        // so it's cast back to a string-keyed view (safe: JS object keys are always strings/symbols
        // at runtime regardless of T).
        const scatters = this.getWinningScatters() as unknown as Record<string, WinningScatter<T>>;
        return Object.values(scatters).reduce((sum, scatter) => sum + scatter.getWinAmount(), 0);
    }

    public getClustersWinning(): number {
        return Object.values(this.getWinningClusters()).reduce((sum, cluster) => sum + cluster.getWinAmount(), 0);
    }

    public getValuesWinning(): number {
        const values = this.getWinningValues() as unknown as Record<string, WinningValueDescribing<T>>;
        return Object.values(values).reduce((sum, value) => sum + value.getWinAmount(), 0);
    }
}
