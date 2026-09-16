import {POKIE_WASM_ADAPTER, type PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";
import {readCanonicalPokieWasmModule, type PokieWasmGameModel} from "./PokieWasmCanonicalModule.js";
import type {PokieWasmHost, PokieWasmRound, PokieWasmRuntime, PokieWasmRuntimeSession, PokieWasmSessionState} from "./PokieWasmRuntimeApi.js";

/** Returns only portable metadata; no filesystem or package loading occurs here. */
export function inspectPokieWasm(manifest: PokieWasmComponentManifest): PokieWasmComponentManifest {
    return JSON.parse(JSON.stringify(manifest)) as PokieWasmComponentManifest;
}

/** Instantiates the canonical portable ABI and derives complete deterministic rounds from it. */
export async function instantiatePokieWasm(bytes: BufferSource, manifest: PokieWasmComponentManifest, host: PokieWasmHost): Promise<PokieWasmRuntime> {
    if (manifest.artifact === undefined) throw new Error("This is a legacy sidecar-only WASM component and is inspection-only; build a canonical POKIE WASM artifact to run it.");
    if (manifest.artifact.adapter !== POKIE_WASM_ADAPTER) throw new Error(`Unsupported POKIE WASM adapter "${manifest.artifact.adapter}".`);
    const canonical = readCanonicalPokieWasmModule(bytes);
    let currentDraw: number | undefined;
    const instance = await WebAssembly.instantiate(canonical.module, {
        pokie: {
            "next_random": () => {
                const draw = host.nextRandom();
                if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("POKIE WASM host RNG must return a finite value in [0, 1).");
                currentDraw = draw;
                return Math.floor(draw * 0x7fffffff);
            },
        },
    });
    const play = instance.exports.play;
    if (typeof play !== "function") throw new Error("POKIE WASM artifact is missing its canonical play export.");
    let disposed = false;
    const session = (state: PokieWasmSessionState): PokieWasmRuntimeSession => ({
        play: (command: Record<string, unknown> = {}) => Promise.resolve().then(() => {
            if (disposed) throw new Error("The WASM runtime has been disposed.");
            currentDraw = undefined;
            const packedStops = play();
            if (typeof packedStops !== "number" || currentDraw === undefined) throw new Error("POKIE WASM play export must return packed reel stops after requesting host RNG draws.");
            const stops = unpackStops(packedStops, canonical.model);
            const screen = buildScreen(stops, canonical.model);
            const winMultiplier = evaluateWinMultiplier(screen, canonical.model);
            const stake = typeof command.bet === "number" && Number.isFinite(command.bet) && command.bet > 0 ? command.bet : 1;
            const next = {schemaVersion: "pokie.state.v1" as const, seed: state.seed, draws: [...state.draws, currentDraw], sequence: state.sequence + 1};
            state = next;
            return {sequence: next.sequence, draw: currentDraw, stops, screen, winMultiplier, payout: winMultiplier * stake, command: JSON.parse(JSON.stringify(command)) as Record<string, unknown>} satisfies PokieWasmRound;
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
            const results: PokieWasmRound[] = [];
            for (const command of commands) results.push(await restored.play(command));
            restored.dispose();
            return results;
        },
        dispose: () => {
            disposed = true;
        },
    };
}

function unpackStops(packedStops: number, model: PokieWasmGameModel): readonly number[] {
    let shift = 0;
    return model.stopWidths.map((width, index) => {
        const stop = (packedStops >>> shift) & ((1 << width) - 1);
        shift += width;
        return stop % model.reelStrips[index].length;
    });
}

function buildScreen(stops: readonly number[], model: PokieWasmGameModel): readonly (readonly string[])[] {
    return model.reelStrips.map((strip, reel) => Array.from({length: model.rows}, (_, row) => strip[(stops[reel] + row) % strip.length]));
}

function evaluateWinMultiplier(screen: readonly (readonly string[])[], model: PokieWasmGameModel): number {
    return model.paylines.reduce((total, line) => {
        const symbols = line.map((row, reel) => screen[reel][row]);
        const first = symbols[0];
        let count = 1;
        while (count < symbols.length && symbols[count] === first) count++;
        return total + (model.paytable[first]?.[String(count)] ?? 0);
    }, 0);
}
