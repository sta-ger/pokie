import type {WinEvaluationResultNetworkData} from "../VideoSlotNetworkData.js";

// One entry of a CascadeSessionSerializer round's `stages` array — mirrors CascadeStep's own
// getters one-to-one.
export type CascadeStepNetworkData<T extends string | number | symbol = string> = {
    screen: T[][];
    winEvaluationResult: WinEvaluationResultNetworkData<T>;
    removedPositions: number[][];
    refillSymbols: T[][];
    metadata: Record<string, unknown>;
    rngInfo: Record<string, unknown>;
    debugInfo: Record<string, unknown>;
};
