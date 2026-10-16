import {ACTIVE_POKIE_WASM_TRACES as ACTIVE_TRACE_COLLECTORS} from "./internal/PokieWasmTraceOwnership.js";
import {instantiateDeclarativeWasmRuntime} from "./internal/instantiateDeclarativeWasmRuntime.js";
import {lowerSharedSlotMath, readSharedSlotMathResult} from "./math/SharedSlotMath.js";
import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import {
    POKIE_WASM_RUNTIME_PLAY_DECLARATION,
    POKIE_WASM_RUNTIME_REPLAY_DECLARATION,
    POKIE_WASM_RUNTIME_SERIALIZE_DECLARATION,
    hasCanonicalWasmOperationDeclaration,
    readIntegrityBoundCanonicalPokieWasmArtifact,

} from "./PokieWasmCanonicalModule.js";
import {BoundedPokieWasmTraceCollector, POKIE_WASM_DEFAULT_CREDITS, type PokieWasmHost, type PokieWasmHostState, type PokieWasmRound, type PokieWasmRuntime, type PokieWasmRuntimeSession, type PokieWasmOrdinarySessionState, type PokieWasmRestorableState} from "./PokieWasmRuntimeApi.js";

const MAX_HOST_RANDOM_DRAWS_PER_PLAY = 1024;

/** A browser-safe serializable host stream for deterministic sessions and replay. */
export class SeededPokieWasmHost implements PokieWasmHost {
    private readonly random: SeededRandomNumberGenerator;

    public constructor(seed: string | number) {
        this.random = new SeededRandomNumberGenerator(seed);
    }

    public resetSeed(seed: string): void {
        this.random.fromSessionState(new SeededRandomNumberGenerator(seed).toSessionState());
    }

    public nextRandom(): number {
        return this.random.getRandomInt(0, 0x100000000) / 0x100000000;
    }

    public serializeState(): PokieWasmHostState {
        return this.random.toSessionState();
    }

    public restoreState(state: PokieWasmHostState): void {
        if (typeof state !== "number" || !Number.isSafeInteger(state) || state < 0 || state > 0xffffffff) throw new Error("Invalid seeded POKIE WASM host continuation.");
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
    if (canonical.model.features) return instantiateDeclarativeWasmRuntime({...canonical.model, features: canonical.model.features}, manifest, host);
    const ordinaryModel = canonical.model;
    const layout = lowerSharedSlotMath(ordinaryModel);
    const artifactIdentity = manifest.artifact!.sha256;
    let currentDraws: number[] = [];
    const instance = await WebAssembly.instantiate(canonical.module, {
        pokie: {
            "next_random": () => {
                if (currentDraws.length >= MAX_HOST_RANDOM_DRAWS_PER_PLAY) throw new Error("POKIE WASM play requested too many host random draws while selecting reel stops.");
                const draw = nextDraw();
                if (currentDraws.length >= ordinaryModel.reels) throw new Error("POKIE WASM play requested more reel stops than its canonical model declares.");
                currentDraws.push(draw);
                return draw;
            },
        },
    });
    const play = instance.exports.play;
    if (typeof play !== "function") throw new Error("POKIE WASM artifact is missing its canonical play export.");
    let disposed = false;
    const sessions = new Set<() => void>();
    const collectors = new Set<BoundedPokieWasmTraceCollector>();
    const diagnostics = {generatedDraws: 0, hostRestorations: 0, hostPayloadBytes: 0, snapshotPayloadBytes: 0};
    const hostSnapshot = (): PokieWasmHostState | undefined => {
        const state = host.serializeState?.();
        if (state === undefined) return undefined;
        const copy = cloneHostState(state);
        diagnostics.hostPayloadBytes += new TextEncoder().encode(JSON.stringify(copy)).length;
        return copy;
    };
    const snapshot = (state: PokieWasmOrdinarySessionState): PokieWasmOrdinarySessionState => {
        const json = JSON.stringify(state);
        diagnostics.snapshotPayloadBytes += new TextEncoder().encode(json).length;
        return JSON.parse(json) as PokieWasmOrdinarySessionState;
    };
    const acquireTrace = (trace?: BoundedPokieWasmTraceCollector): void => {
        if (trace === undefined) return;
        if (!(trace instanceof BoundedPokieWasmTraceCollector) || trace.status !== "open" || ACTIVE_TRACE_COLLECTORS.has(trace) || trace.record !== BoundedPokieWasmTraceCollector.prototype.record || trace.dispose !== BoundedPokieWasmTraceCollector.prototype.dispose || trace.complete !== BoundedPokieWasmTraceCollector.prototype.complete) throw new Error("WASM trace collector must be open and exclusively attached.");
        collectors.add(trace);
        ACTIVE_TRACE_COLLECTORS.add(trace);
    };
    const releaseTrace = (trace?: BoundedPokieWasmTraceCollector): void => {
        if (trace === undefined) return;
        Reflect.apply(BoundedPokieWasmTraceCollector.prototype.dispose, trace, []);
        collectors.delete(trace);
        ACTIVE_TRACE_COLLECTORS.delete(trace);
    };
    function nextDraw(): number {
        const draw = host.nextRandom();
        diagnostics.generatedDraws++;
        if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("POKIE WASM host RNG must return a finite value in [0, 1).");
        return draw;
    }
    function initialState(seed: string, credits: number, trace?: BoundedPokieWasmTraceCollector): PokieWasmOrdinarySessionState {
        const draws: number[] = [];
        if (host.resetSeed !== undefined) {
            host.resetSeed(seed);
            // Node constructs an unpaid initial screen. Consume the same draws
            // without invoking a paid export or changing the session ledger.
            for (let reel = 0; reel < ordinaryModel.reels; reel++) draws.push(nextDraw());
        }
        const rngState = hostSnapshot();
        if (trace !== undefined) Reflect.apply(BoundedPokieWasmTraceCollector.prototype.record, trace, [{kind: "initialization", sequence: 0, draws}]);
        return {schemaVersion: "pokie.state.v3", artifactIdentity, seed, drawCount: draws.length, sequence: 0, credits,
            ...(rngState === undefined ? {} : {rngState: cloneHostState(rngState)})};
    }
    const restoreState = (state: PokieWasmRestorableState, trace?: BoundedPokieWasmTraceCollector): PokieWasmOrdinarySessionState => {
        if (state === null || typeof state !== "object" || !["pokie.state.v1", "pokie.state.v2", "pokie.state.v3"].includes(state.schemaVersion) || typeof state.seed !== "string" ||
            !Number.isSafeInteger(state.sequence) || state.sequence < 0 || !Number.isFinite(state.credits) || state.credits < 0 || (state.rngState !== undefined && !isHostState(state.rngState))) {
            throw new Error("Unsupported or malformed POKIE WASM session state.");
        }
        if (state.schemaVersion === "pokie.state.v3" && state.artifactIdentity !== artifactIdentity) throw new Error("POKIE WASM state belongs to an incompatible artifact identity.");
        if (state.schemaVersion === "pokie.state.v2" && (state.sequence !== 0 || state.drawCount !== 0)) throw new Error("Unbound compact POKIE WASM state is incompatible; start a new session.");
        if (state.schemaVersion === "pokie.state.v4") throw new Error("Feature state cannot restore an ordinary artifact.");
        const legacy = state.schemaVersion === "pokie.state.v1";
        if (legacy ? !Array.isArray(state.draws) || !state.draws.every(draw => typeof draw === "number" && Number.isFinite(draw) && draw >= 0 && draw < 1) :
            !Number.isSafeInteger(state.drawCount) || state.drawCount < 0 || "draws" in state) {
            throw new Error("Unsupported or malformed POKIE WASM session state.");
        }
        const drawCount = legacy ? state.draws.length : state.drawCount;
        if (drawCount !== state.sequence * ordinaryModel.reels && drawCount !== (state.sequence + 1) * ordinaryModel.reels) throw new Error("Malformed POKIE WASM draw count.");
        if (state.rngState !== undefined) {
            if (host.restoreState === undefined) throw new Error("This POKIE WASM host cannot restore the serialized RNG continuation.");
            host.restoreState(cloneHostState(state.rngState));
            diagnostics.hostRestorations++;
        } else if (state.sequence === 0 && drawCount === 0) {
            if (host.resetSeed !== undefined) return initialState(state.seed, state.credits, trace);
            if (host.resetInitialState !== undefined) {
                host.resetInitialState();
                return initialState(state.seed, state.credits, trace);
            }
            throw new Error("This POKIE WASM host cannot restore deterministic RNG continuation from a seed label.");
        } else {
            throw new Error("POKIE WASM session state is missing its deterministic RNG continuation.");
        }
        // Import once; never retain the input object or its legacy evidence.
        const rngState = hostSnapshot() ?? (state.rngState === undefined ? undefined : cloneHostState(state.rngState));
        return {schemaVersion: "pokie.state.v3", artifactIdentity, seed: state.seed, drawCount, sequence: state.sequence, credits: state.credits,
            ...(rngState === undefined ? {} : {rngState})};
    };
    const playRound = (state: PokieWasmOrdinarySessionState, command: Record<string, unknown> = {}): {readonly round: PokieWasmRound; readonly state: PokieWasmOrdinarySessionState} => {
        currentDraws = [];
        if (!Number.isSafeInteger(state.sequence + 1) || !Number.isSafeInteger(state.drawCount + ordinaryModel.reels)) throw new Error("POKIE WASM continuation counters are exhausted.");
        const stake = resolveStake(command, ordinaryModel);
        const creditsBefore = state.credits;
        if (creditsBefore < stake) throw new Error(`POKIE WASM session has insufficient credits for stake ${stake}.`);
        // Each settled session owns its continuation even when replay, restore,
        // or a sibling session has since used the runtime's shared host.
        if (state.rngState !== undefined) {
            if (host.restoreState === undefined) throw new Error("This POKIE WASM host cannot restore the serialized RNG continuation.");
            host.restoreState(cloneHostState(state.rngState));
            diagnostics.hostRestorations++;
        }
        const payout = play(stake);
        if (currentDraws.length !== ordinaryModel.reels) throw new WebAssembly.RuntimeError("POKIE WASM play returned an invalid draw cardinality.");
        const {stops, screen} = readSharedSlotMathResult(instance, ordinaryModel, payout, layout);
        const winMultiplier = payout / stake;
        if (!Number.isFinite(creditsBefore - stake + payout)) throw new Error("POKIE WASM payout or balance overflow.");
        const rngState = hostSnapshot();
        const next = {
            schemaVersion: "pokie.state.v3" as const,
            artifactIdentity,
            seed: state.seed,
            drawCount: state.drawCount + currentDraws.length,
            sequence: state.sequence + 1,
            credits: creditsBefore - stake + payout,
            ...(rngState === undefined ? {} : {rngState: cloneHostState(rngState)}),
        };
        return {
            state: next,
            round: {sequence: next.sequence, draw: currentDraws[0], stops, screen, winMultiplier, stake, payout, creditsBefore, credits: next.credits, command: JSON.parse(JSON.stringify(command)) as Record<string, unknown>},
        };
    };
    const session = (initial: PokieWasmOrdinarySessionState, initialTrace?: BoundedPokieWasmTraceCollector): PokieWasmRuntimeSession => {
        let state: PokieWasmOrdinarySessionState | undefined = initial;
        let trace = initialTrace;
        const dispose = (): void => {
            state = undefined;
            releaseTrace(trace);
            trace = undefined;
            sessions.delete(dispose);
        };
        sessions.add(dispose);
        return {
            play: (command: Record<string, unknown> = {}) => Promise.resolve().then(() => {
                if (disposed || state === undefined) throw new Error("The WASM runtime session has been disposed.");
                requireDeclaredOperation(POKIE_WASM_RUNTIME_PLAY_DECLARATION, "play a session round");
                try {
                    const result = playRound(state, command);
                    state = result.state;
                    if (trace !== undefined) Reflect.apply(BoundedPokieWasmTraceCollector.prototype.record, trace, [{kind: "round", sequence: state.sequence, draws: currentDraws}]);
                    return result.round;
                } catch (error) {
                    if (error instanceof WebAssembly.RuntimeError) runtime.dispose();
                    throw error;
                } finally {
                    currentDraws = [];
                }
            }),
            serialize: () => {
                if (disposed || state === undefined) throw new Error("The WASM runtime session has been disposed.");
                requireDeclaredOperation(POKIE_WASM_RUNTIME_SERIALIZE_DECLARATION, "serialize a session");
                return snapshot(state);
            },
            setTraceCollector: (replacement) => {
                if (disposed || state === undefined) throw new Error("The WASM runtime session has been disposed.");
                if (replacement === trace) return;
                acquireTrace(replacement);
                releaseTrace(trace);
                trace = replacement;
            },
            dispose,
        };
    };
    const runtime: PokieWasmRuntime = {
        manifest: inspectPokieWasm(manifest),
        getDiagnostics: () => ({...diagnostics}),
        createSession: (seed, options = {}) => {
            if (disposed) throw new Error("The WASM runtime has been disposed.");
            if (typeof seed !== "string") throw new Error("POKIE WASM session seed must be a string.");
            const credits = options.credits ?? POKIE_WASM_DEFAULT_CREDITS;
            if (!Number.isFinite(credits) || credits < 0) throw new Error("POKIE WASM session credits must be a finite non-negative number.");
            acquireTrace(options.trace);
            try {
                return session(initialState(seed, credits, options.trace), options.trace);
            } catch (error) {
                releaseTrace(options.trace);
                throw error;
            } finally {
                currentDraws = [];
            }
        },
        restoreSession: (state, options = {}) => {
            if (disposed) throw new Error("The WASM runtime has been disposed.");
            requireDeclaredOperation(POKIE_WASM_RUNTIME_SERIALIZE_DECLARATION, "restore a session");
            acquireTrace(options.trace);
            try {
                return session(restoreState(state, options.trace), options.trace);
            } catch (error) {
                releaseTrace(options.trace);
                throw error;
            }
        },
        replay: (state, commands, options = {}) => Promise.resolve().then(() => {
            if (disposed) throw new Error("The WASM runtime has been disposed.");
            requireDeclaredOperation(POKIE_WASM_RUNTIME_REPLAY_DECLARATION, "replay session rounds");
            if (!Array.isArray(commands) || !commands.every((command) => command !== null && typeof command === "object" && !Array.isArray(command))) {
                throw new Error("Malformed POKIE WASM replay commands: expected command objects.");
            }
            acquireTrace(options.trace);
            try {
                let replayState = restoreState(state, options.trace);
                const results: PokieWasmRound[] = [];
                let stateBeforeFinal: PokieWasmOrdinarySessionState | undefined;
                for (const command of commands) {
                    if (results.length === commands.length - 1) stateBeforeFinal = replayState;
                    const result = playRound(replayState, command);
                    replayState = result.state;
                    if (options.trace !== undefined) Reflect.apply(BoundedPokieWasmTraceCollector.prototype.record, options.trace, [{kind: "replay", sequence: replayState.sequence, draws: currentDraws}]);
                    currentDraws = [];
                    results.push(result.round);
                }
                if (options.trace !== undefined) Reflect.apply(BoundedPokieWasmTraceCollector.prototype.complete, options.trace, []);
                return {
                    rounds: results,
                    ...(stateBeforeFinal === undefined ? {} : {stateBeforeFinal: snapshot(stateBeforeFinal)}),
                    stateAfter: snapshot(replayState),
                };
            } catch (error) {
                releaseTrace(options.trace);
                if (error instanceof WebAssembly.RuntimeError) runtime.dispose();
                throw error;
            } finally {
                if (options.trace !== undefined) {
                    collectors.delete(options.trace);
                    ACTIVE_TRACE_COLLECTORS.delete(options.trace);
                }
                currentDraws = [];
            }
        }),
        dispose: () => {
            disposed = true;
            new Uint8Array((instance.exports.memory as WebAssembly.Memory).buffer).fill(0);
            for (const dispose of sessions) dispose();
            currentDraws = [];
            host = {nextRandom: () => {
                throw new Error("The WASM runtime has been disposed.");
            }};
        },
    };
    function requireDeclaredOperation(declaration: string, action: string): void {
        if (!hasCanonicalWasmOperationDeclaration(manifest, declaration)) {
            throw new Error(`POKIE WASM artifact does not declare ${declaration}; it cannot ${action}.`);
        }
    }
    return runtime;
}

function cloneHostState(state: PokieWasmHostState): PokieWasmHostState {
    if (!isHostState(state)) throw new Error("POKIE WASM host RNG continuation must be JSON-safe.");
    return JSON.parse(JSON.stringify(state)) as PokieWasmHostState;
}

function isHostState(value: unknown): value is PokieWasmHostState {
    if (value === null || typeof value === "string" || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.every(isHostState);
    return typeof value === "object" && Object.values(value).every(isHostState);
}

function resolveStake(command: Record<string, unknown>, model: import("./math/SharedSlotMath.js").SharedSlotMathModel): number {
    if (command.mode !== undefined) throw new Error("This WASM model does not support bet mode selection.");
    if (command.delivery !== undefined || command.roundId !== undefined) throw new Error("This ordinary WASM artifact does not declare logical delivery; use its plain play contract.");
    if (command.continuation !== undefined) throw new Error("This ordinary WASM model has no pending continuation.");
    const stake = command.bet === undefined ? model.availableBets?.[0] ?? 1 : command.bet;
    if (typeof stake !== "number" || !Number.isFinite(stake) || stake <= 0) throw new Error("POKIE WASM play command bet must be a finite positive number.");
    if (model.availableBets !== undefined && !model.availableBets.includes(stake)) {
        throw new Error(`POKIE WASM play command bet ${stake} is unavailable; choose one of: ${model.availableBets.join(", ")}.`);
    }
    return stake;
}
