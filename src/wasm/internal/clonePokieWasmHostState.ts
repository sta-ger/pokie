import type {PokieWasmHostState} from "../PokieWasmRuntimeApi.js";

/** Continuation is caller-owned JSON data; never repair nonfinite or missing fields. */
export function clonePokieWasmHostState(value: PokieWasmHostState): PokieWasmHostState {
    const seen = new Set<object>();
    const valid = (item: unknown): boolean => {
        if (item === null || typeof item === "string" || typeof item === "boolean") return true;
        if (typeof item === "number") return Number.isFinite(item);
        if (!item || typeof item !== "object" || seen.has(item)) return false;
        seen.add(item);
        const result = Array.isArray(item) ? item.every(valid) : [Object.prototype, null].includes(Reflect.getPrototypeOf(item) as object | null) && Object.values(item).every(valid);
        seen.delete(item);
        return result;
    };
    if (!valid(value)) throw new Error("POKIE WASM host RNG continuation must be JSON-safe.");
    return JSON.parse(JSON.stringify(value)) as PokieWasmHostState;
}
