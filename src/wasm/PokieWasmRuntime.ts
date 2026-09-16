import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {readIntegrityBoundCanonicalPokieWasmArtifact, type PokieWasmGameModel} from "./PokieWasmCanonicalModule.js";
import type {PokieWasmHost, PokieWasmHostState, PokieWasmRound, PokieWasmRuntime, PokieWasmRuntimeSession, PokieWasmSessionState} from "./PokieWasmRuntimeApi.js";

const MAX_HOST_RANDOM_DRAWS_PER_PLAY = 1024;

/** A browser-safe serializable host stream for deterministic sessions and replay. */
export class SeededPokieWasmHost implements PokieWasmHost {
    private readonly random: SeededRandomNumberGenerator;

    public constructor(seed: string | number) {
        this.random = new SeededRandomNumberGenerator(seed);
    }

    public nextRandom(): number {
        return this.random.getRandomInt(0, 0x100000000) / 0x100000000;
    }

    public serializeState(): PokieWasmHostState {
        return this.random.toSessionState();
    }

    public restoreState(state: PokieWasmHostState): void {
        if (typeof state !== "number" || !Number.isSafeInteger(state)) throw new Error("Invalid seeded POKIE WASM host continuation.");
        this.random.fromSessionState(state);
    }
}

/** Returns only portable metadata; no filesystem or package loading occurs here. */
export function inspectPokieWasm(manifest: PokieWasmComponentManifest): PokieWasmComponentManifest {
    return JSON.parse(JSON.stringify(manifest)) as PokieWasmComponentManifest;
}

/** Instantiates the canonical portable ABI and derives complete deterministic rounds from it. */
export async function instantiatePokieWasm(bytes: BufferSource, manifest: PokieWasmComponentManifest, host: PokieWasmHost): Promise<PokieWasmRuntime> {
    const canonical = await readIntegrityBoundCanonicalPokieWasmArtifact(bytes, manifest);
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
    const session = (state: PokieWasmSessionState): PokieWasmRuntimeSession => {
        let sessionDisposed = false;
        return {
            play: (command: Record<string, unknown> = {}) => Promise.resolve().then(() => {
                if (disposed || sessionDisposed) throw new Error("The WASM runtime session has been disposed.");
                currentDraws = [];
                const stake = resolveStake(command, canonical.model);
                const packedStops = play();
                if (typeof packedStops !== "number" || currentDraws.length === 0) throw new Error("POKIE WASM play export must return packed reel stops after requesting host RNG draws.");
                const stops = unpackStops(packedStops, canonical.model);
                const screen = buildScreen(stops, canonical.model);
                const winMultiplier = evaluateWinMultiplier(screen, canonical.model);
                const rngState = host.serializeState?.();
                const next = {
                    schemaVersion: "pokie.state.v1" as const,
                    seed: state.seed,
                    draws: [...state.draws, ...currentDraws],
                    sequence: state.sequence + 1,
                    ...(rngState === undefined ? {} : {rngState: cloneHostState(rngState)}),
                };
                state = next;
                return {sequence: next.sequence, draw: currentDraws[0], stops, screen, winMultiplier, stake, payout: winMultiplier * stake, command: JSON.parse(JSON.stringify(command)) as Record<string, unknown>} satisfies PokieWasmRound;
            }),
            serialize: () => JSON.parse(JSON.stringify(state)) as PokieWasmSessionState,
            dispose: () => {
                sessionDisposed = true;
            },
        };
    };
    const runtime: PokieWasmRuntime = {
        manifest: inspectPokieWasm(manifest),
        createSession: (seed) => session({schemaVersion: "pokie.state.v1", seed, draws: [], sequence: 0}),
        restoreSession: (state) => {
            if (state.schemaVersion !== "pokie.state.v1" || typeof state.seed !== "string" || !Array.isArray(state.draws) ||
                !state.draws.every((draw) => typeof draw === "number" && Number.isFinite(draw) && draw >= 0 && draw < 1) ||
                !Number.isSafeInteger(state.sequence) || state.sequence < 0 || !isHostState(state.rngState)) {
                throw new Error("Unsupported or malformed POKIE WASM session state.");
            }
            if (state.rngState !== undefined) {
                if (host.restoreState === undefined) throw new Error("This POKIE WASM host cannot restore the serialized RNG continuation.");
                host.restoreState(state.rngState);
            }
            return session(JSON.parse(JSON.stringify(state)) as PokieWasmSessionState);
        },
        replay: async (state, commands) => {
            const restored = runtime.restoreSession(state);
            const results: PokieWasmRound[] = [];
            for (const command of commands) results.push(await restored.play(command));
            restored.dispose();
            return results;
        },
        dispose: () => {
            disposed = true;
        },
    };
    return runtime;
}

function cloneHostState(state: PokieWasmHostState): PokieWasmHostState {
    return JSON.parse(JSON.stringify(state)) as PokieWasmHostState;
}

function isHostState(value: unknown): value is PokieWasmHostState | undefined {
    if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(isHostState);
    return typeof value === "object" && Object.values(value).every(isHostState);
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
