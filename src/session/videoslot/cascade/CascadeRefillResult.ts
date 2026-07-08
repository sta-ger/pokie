export type CascadeRefillResult<T extends string | number | symbol = string> = {
    refillSymbols: T[][];
    rngInfo?: Record<string, unknown>;
    debugInfo?: Record<string, unknown>;
};
