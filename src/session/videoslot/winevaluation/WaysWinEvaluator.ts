import {WaysWinCalculating} from "../wincalculator/WaysWinCalculating.js";
import {WinningWayDescribing} from "../WinningWayDescribing.js";
import {WaysWinComponent} from "./WaysWinComponent.js";
import {WinComponent} from "./WinComponent.js";
import {WinEvaluationContext} from "./WinEvaluationContext.js";
import {WinEvaluator} from "./WinEvaluator.js";

export class WaysWinEvaluator<T extends string | number | symbol = string> implements WinEvaluator<T> {
    private readonly calculator: WaysWinCalculating<T>;

    constructor(calculator: WaysWinCalculating<T>) {
        this.calculator = calculator;
    }

    public getEvaluatorId(): string {
        return "ways";
    }

    public getEvaluatorGroup(): string {
        return "ways";
    }

    public getComponentType(): string {
        return "ways";
    }

    public evaluate(context: WinEvaluationContext<T>): WinComponent<T>[] {
        const ways = this.calculator.calculateWinningWays(context.getBet(), context.getSymbolsCombination());
        const waysByKey = ways as unknown as Record<string, WinningWayDescribing<T>>;
        return Object.values(waysByKey).map((way) => new WaysWinComponent<T>(way));
    }
}
