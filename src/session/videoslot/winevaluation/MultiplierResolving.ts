import type {WinComponent} from "./WinComponent.js";
import type {WinEvaluationContext} from "./WinEvaluationContext.js";
import type {WinMultiplierBreakdown} from "./WinMultiplierBreakdown.js";

/**
 * Replaceable boundary for symbol-driven multipliers.
 *
 * Depend on this interface rather than the concrete `MultiplierResolver` when a game supplies its
 * own multiplier strategy (for example a mystery-symbol table, a progressive multiplier, or a
 * per-round cap). The built-in `MultiplierResolver` implements it unchanged.
 */
export interface MultiplierResolving<T extends string | number | symbol = string> {
    getSupportedComponentTypes(): string[] | undefined;
    supportsComponentType(componentType: string): boolean;
    resolve(component: WinComponent<T>, context: WinEvaluationContext<T>): {
        winAmount: number;
        breakdown: WinMultiplierBreakdown[];
    };
}
