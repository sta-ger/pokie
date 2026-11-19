import {ScatterWinCalculating} from "../wincalculator/ScatterWinCalculating.js";
import {ScatterWinComponent} from "./ScatterWinComponent.js";
import {WinComponent} from "./WinComponent.js";
import {WinEvaluationContext} from "./WinEvaluationContext.js";
import {WinEvaluator} from "./WinEvaluator.js";
import {recordValues} from "../../../internal/recordValues.js";

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
        return recordValues(scatters).map((scatter) => new ScatterWinComponent<T>(scatter));
    }
}
