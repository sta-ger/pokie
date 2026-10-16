import type {BoundedPokieWasmTraceCollector} from "../PokieWasmRuntimeApi.js";
/** All portable model families share collector ownership, including sibling runtimes. */
export const ACTIVE_POKIE_WASM_TRACES = new WeakSet<BoundedPokieWasmTraceCollector>();
