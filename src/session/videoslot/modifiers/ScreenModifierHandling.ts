import type {ScreenModifierObservation, ScreenModifierState} from "./ScreenModifiers.js";

export interface ScreenModifierHandling<T extends string | number | symbol = string> {
    initialState(): ScreenModifierState<T>;
    validateState(value: unknown): void;
    validateObservation(value: unknown, state: ScreenModifierState<T>): void;
    execute(
        matrix: T[][],
        state: ScreenModifierState<T>,
    ): {matrix: T[][]; state: ScreenModifierState<T>; observation: ScreenModifierObservation<T>};
}
