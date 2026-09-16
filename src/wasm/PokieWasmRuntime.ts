import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";
import type {PokieWasmHost, PokieWasmRuntime, PokieWasmRuntimeSession, PokieWasmSessionState} from "./PokieWasmRuntimeApi.js";

/** Returns only portable metadata; no filesystem or package loading occurs here. */
export function inspectPokieWasm(manifest: PokieWasmComponentManifest): PokieWasmComponentManifest {
    return JSON.parse(JSON.stringify(manifest)) as PokieWasmComponentManifest;
}

/** Instantiates only standards WebAssembly and keeps all host state JSON-safe. */
export async function instantiatePokieWasm(bytes: BufferSource, manifest: PokieWasmComponentManifest, host: PokieWasmHost): Promise<PokieWasmRuntime> {
    if (manifest.artifact === undefined) throw new Error("This is a legacy sidecar-only WASM component and is inspection-only; build a canonical POKIE WASM artifact to run it.");
    if (!WebAssembly.validate(bytes)) throw new Error("The WASM module is malformed or is not a WebAssembly binary.");
    await WebAssembly.instantiate(bytes, {});
    let disposed = false;
    const session = (state: PokieWasmSessionState): PokieWasmRuntimeSession => ({
        play: (command: Record<string, unknown> = {}) => Promise.resolve().then(() => {
            if (disposed) throw new Error("The WASM runtime has been disposed.");
            const draw = host.nextRandom();
            if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("POKIE WASM host RNG must return a finite value in [0, 1).");
            const next = {schemaVersion: "pokie.state.v1" as const, seed: state.seed, draws: [...state.draws, draw], sequence: state.sequence + 1};
            state = next;
            return {sequence: next.sequence, draw, command: JSON.parse(JSON.stringify(command)) as Record<string, unknown>};
        }),
        serialize: () => JSON.parse(JSON.stringify(state)) as PokieWasmSessionState,
        dispose: () => undefined,
    });
    return {
        manifest: inspectPokieWasm(manifest),
        createSession: (seed) => session({schemaVersion: "pokie.state.v1", seed, draws: [], sequence: 0}),
        restoreSession: (state) => {
            if (state.schemaVersion !== "pokie.state.v1" || !Array.isArray(state.draws) || !Number.isSafeInteger(state.sequence)) throw new Error("Unsupported or malformed POKIE WASM session state.");
            return session(JSON.parse(JSON.stringify(state)) as PokieWasmSessionState);
        },
        replay: async (state, commands) => {
            const restored = session(JSON.parse(JSON.stringify(state)) as PokieWasmSessionState);
            const results: Array<{readonly sequence: number; readonly draw: number; readonly command: Record<string, unknown>}> = [];
            for (const command of commands) results.push(await restored.play(command));
            restored.dispose();
            return results;
        },
        dispose: () => {
            disposed = true;
        },
    };
}
