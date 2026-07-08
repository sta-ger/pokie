import {SymbolsCombinationsAnalyzer} from "../combinations/SymbolsCombinationsAnalyzer.js";
import {WinComponent} from "./WinComponent.js";
import {WinEvaluationContext} from "./WinEvaluationContext.js";
import {WinMultiplierBreakdown} from "./WinMultiplierBreakdown.js";

export class MultiplierResolver<T extends string | number | symbol = string> {
    private readonly symbolMultipliers: Partial<Record<T, number>>;
    private readonly source: string;
    private readonly combine: (accumulated: number, next: number) => number;
    private readonly identity: number;
    private readonly supportedComponentTypes: string[];

    constructor(
        symbolMultipliers: Partial<Record<T, number>>,
        source = "symbol-multipliers",
        combine: (accumulated: number, next: number) => number = (a, b) => a * b,
        identity = 1,
        supportedComponentTypes = ["line", "scatter", "cluster", "ways", "value"],
    ) {
        this.symbolMultipliers = symbolMultipliers;
        this.source = source;
        this.combine = combine;
        this.identity = identity;
        this.supportedComponentTypes = [...supportedComponentTypes];
    }

    public getSupportedComponentTypes(): string[] {
        return [...this.supportedComponentTypes];
    }

    public resolve(
        component: WinComponent<T>,
        context: WinEvaluationContext<T>,
    ): {winAmount: number; breakdown: WinMultiplierBreakdown[]} {
        const symbols = context.getSymbolsCombination().toMatrix();
        const positions = component.getWinningPositions();
        const matchedValues = positions
            .map(([reelId, rowId]) => {
                const symbolId = symbols[reelId]?.[rowId];
                return symbolId === undefined ? undefined : this.symbolMultipliers[symbolId];
            })
            .filter((value): value is number => value !== undefined);
        const multiplier = SymbolsCombinationsAnalyzer.getPositionsMultiplier(
            symbols,
            positions,
            this.symbolMultipliers,
            this.combine,
            this.identity,
        );
        if (matchedValues.length === 0 || multiplier === this.identity) {
            return {winAmount: component.getWinAmount(), breakdown: []};
        }
        return {
            winAmount: component.getWinAmount() * multiplier,
            breakdown: [
                {
                    source: this.source,
                    positions,
                    values: matchedValues,
                    combinedMultiplier: multiplier,
                },
            ],
        };
    }
}
