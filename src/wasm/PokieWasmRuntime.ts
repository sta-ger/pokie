import {POKIE_WASM_ADAPTER, type PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";
import {assertCanonicalWasmDescriptorMatchesManifest} from "../project/WasmProjectTargetAdapter.js";
import {readCanonicalPokieWasmModule, type PokieWasmGameModel} from "./PokieWasmCanonicalModule.js";
import type {PokieWasmHost, PokieWasmRound, PokieWasmRuntime, PokieWasmRuntimeSession, PokieWasmSessionState} from "./PokieWasmRuntimeApi.js";

const MAX_HOST_RANDOM_DRAWS_PER_PLAY = 1024;

/** Returns only portable metadata; no filesystem or package loading occurs here. */
export function inspectPokieWasm(manifest: PokieWasmComponentManifest): PokieWasmComponentManifest {
    return JSON.parse(JSON.stringify(manifest)) as PokieWasmComponentManifest;
}

/** Instantiates the canonical portable ABI and derives complete deterministic rounds from it. */
export async function instantiatePokieWasm(bytes: BufferSource, manifest: PokieWasmComponentManifest, host: PokieWasmHost): Promise<PokieWasmRuntime> {
    if (manifest.artifact === undefined) throw new Error("This is a legacy sidecar-only WASM component and is inspection-only; build a canonical POKIE WASM artifact to run it.");
    if (manifest.artifact.adapter !== POKIE_WASM_ADAPTER) throw new Error(`Unsupported POKIE WASM adapter "${manifest.artifact.adapter}".`);
    const canonical = readCanonicalPokieWasmModule(bytes);
    assertCanonicalWasmDescriptorMatchesManifest(canonical.descriptor, manifest);
    let currentDraws: number[] = [];
    const instance = await WebAssembly.instantiate(canonical.module, {
        pokie: {
            "next_random": () => {
                if (currentDraws.length >= MAX_HOST_RANDOM_DRAWS_PER_PLAY) throw new Error("POKIE WASM play requested too many host random draws while selecting reel stops.");
                const draw = host.nextRandom();
                if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("POKIE WASM host RNG must return a finite value in [0, 1).");
                currentDraws.push(draw);
                // The portable ABI transports every value in the complete
                // unsigned 31-bit domain (0..2^31-1). WebAssembly coerces
                // the high half into signed i32 bits; the module compares
                // those bits with i32.ge_u before rejection sampling.
                return Math.floor(draw * 0x80000000);
            },
        },
    });
    const play = instance.exports.play;
    if (typeof play !== "function") throw new Error("POKIE WASM artifact is missing its canonical play export.");
    let disposed = false;
    const session = (state: PokieWasmSessionState): PokieWasmRuntimeSession => ({
        play: (command: Record<string, unknown> = {}) => Promise.resolve().then(() => {
            if (disposed) throw new Error("The WASM runtime has been disposed.");
            currentDraws = [];
            const stake = resolveStake(command, canonical.model);
            const packedStops = play();
            if (typeof packedStops !== "number" || currentDraws.length === 0) throw new Error("POKIE WASM play export must return packed reel stops after requesting host RNG draws.");
            const stops = unpackStops(packedStops, canonical.model);
            const screen = buildScreen(stops, canonical.model);
            const winMultiplier = evaluateWinMultiplier(screen, canonical.model);
            const next = {schemaVersion: "pokie.state.v1" as const, seed: state.seed, draws: [...state.draws, ...currentDraws], sequence: state.sequence + 1};
            state = next;
            return {sequence: next.sequence, draw: currentDraws[0], stops, screen, winMultiplier, payout: winMultiplier * stake, command: JSON.parse(JSON.stringify(command)) as Record<string, unknown>} satisfies PokieWasmRound;
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
    const lineWins = model.paylines.reduce((total, line) => {
        const symbols = line.map((row, reel) => screen[reel][row]);
        for (let count = symbols.length; count >= 2; count--) {
            const matching = symbols.slice(0, count);
            const regularSymbols = [...new Set(matching.filter((symbol) => !model.wilds?.includes(symbol)))];
            if (regularSymbols.length !== 1 || !matching.every((symbol) => symbol === regularSymbols[0] || model.wilds?.includes(symbol))) continue;
            if (model.scatters?.includes(regularSymbols[0])) continue;
            return total + (model.paytable[regularSymbols[0]]?.[String(count)] ?? 0);
        }
        return total;
    }, 0);
    const scatterWins = (model.scatters ?? []).reduce((total, scatter) => {
        const count = screen.reduce((matches, reel) => matches + reel.filter((symbol) => symbol === scatter).length, 0);
        return total + (model.paytable[scatter]?.[String(count)] ?? 0);
    }, 0);
    return lineWins + scatterWins;
}

function resolveStake(command: Record<string, unknown>, model: PokieWasmGameModel): number {
    const stake = command.bet === undefined ? model.availableBets?.[0] ?? 1 : command.bet;
    if (typeof stake !== "number" || !Number.isFinite(stake) || stake <= 0) throw new Error("POKIE WASM play command bet must be a finite positive number.");
    if (model.availableBets !== undefined && !model.availableBets.includes(stake)) {
        throw new Error(`POKIE WASM play command bet ${stake} is unavailable; choose one of: ${model.availableBets.join(", ")}.`);
    }
    return stake;
}
