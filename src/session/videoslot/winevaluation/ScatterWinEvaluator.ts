import {ScatterWinCalculating} from "../wincalculator/ScatterWinCalculating.js";
import {WinningScatterDescribing} from "../WinningScatterDescribing.js";
import {ScatterWinComponent} from "./ScatterWinComponent.js";
import {WinComponent} from "./WinComponent.js";
import {WinEvaluationContext} from "./WinEvaluationContext.js";
import {WinEvaluator} from "./WinEvaluator.js";

export class ScatterWinEvaluator<T extends string | number | symbol = string> implements WinEvaluator<T> {
    private readonly calculator: ScatterWinCalculating<T>;

    constructor(calculator: ScatterWinCalculating<T>) {
        this.calculator = calculator;
    }

    public getEvaluatorId(): string {
        return "scatter";
    }

    public getEvaluatorGroup(): string {
        return "scatter";
    }

    public getComponentType(): string {
        return "scatter";
    }

    public evaluate(context: WinEvaluationContext<T>): WinComponent<T>[] {
        const scatters = this.calculator.calculateWinningScatters(context.getBet(), context.getSymbolsCombination());
        const scattersByKey = scatters as unknown as Record<string, WinningScatterDescribing<T>>;
        return Object.values(scattersByKey).map((scatter) => new ScatterWinComponent<T>(scatter));
    }
}
