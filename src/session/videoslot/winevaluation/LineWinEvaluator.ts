import {
    LineWinCalculating,
} from "../wincalculator/LineWinCalculating.js";
import {SymbolsCombinationsAnalyzer} from "../combinations/SymbolsCombinationsAnalyzer.js";
import {LineWinComponent} from "./LineWinComponent.js";
import {WinComponent} from "./WinComponent.js";
import {WinEvaluationContext} from "./WinEvaluationContext.js";
import {WinEvaluator} from "./WinEvaluator.js";

export class LineWinEvaluator<T extends string | number | symbol = string> implements WinEvaluator<T> {
    private readonly calculator: LineWinCalculating<T>;

    constructor(calculator: LineWinCalculating<T>) {
        this.calculator = calculator;
    }

    public getEvaluatorId(): string {
        return "line";
    }

    public getEvaluatorGroup(): string {
        return "line";
    }

    public getComponentType(): string {
        return "line";
    }

    public evaluate(context: WinEvaluationContext<T>): WinComponent<T>[] {
        return Object.values(this.calculator.calculateWinningLines(context.getBet(), context.getSymbolsCombination())).map((line) =>
            new LineWinComponent<T>(
                line,
                SymbolsCombinationsAnalyzer.getLineSymbolsGridPositions(line.getDefinition(), line.getSymbolsPositions()),
            ),
        );
    }
}
