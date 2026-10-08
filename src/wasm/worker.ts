import {instantiatePokieWasm, SeededPokieWasmHost} from "./PokieWasmRuntime.js";
import {BoundedPokieWasmTraceCollector, type PokieWasmHost, type PokieWasmHostState, type PokieWasmRuntime, type PokieWasmRestorableState} from "./PokieWasmRuntimeApi.js";
import {sha256CanonicalWasmBytes} from "./PokieWasmCanonicalModule.js";
import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";

export type PokieWasmWorkerRequest =
    | {readonly id: string; readonly type: "instantiate"; readonly bytes: Uint8Array; readonly manifest: PokieWasmComponentManifest; readonly draws?: readonly number[]; readonly seed?: string; readonly credits?: number; readonly traceCapacity?: number}
    | {readonly id: string; readonly type: "play"; readonly command?: Record<string, unknown>}
    | {readonly id: string; readonly type: "restore"; readonly state: PokieWasmRestorableState}
    | {readonly id: string; readonly type: "serialize"}
    | {readonly id: string; readonly type: "trace"}
    | {readonly id: string; readonly type: "replay"; readonly state: PokieWasmRestorableState; readonly commands: readonly Record<string, unknown>[]; readonly traceCapacity?: number}
    | {readonly id: string; readonly type: "cancel"}
    | {readonly id: string; readonly type: "dispose"};
export type PokieWasmWorkerResponse = {readonly id: string; readonly ok: true; readonly result?: unknown} | {readonly id: string; readonly ok: false; readonly error: string};

/** State owner used by a real Web Worker entry or directly by browser hosts. */
export class PokieWasmWorkerProtocol {
    private runtime: PokieWasmRuntime | undefined;
    private session: ReturnType<PokieWasmRuntime["createSession"]> | undefined;

    private generation = 0;
    private trace: BoundedPokieWasmTraceCollector | undefined;
    private tapeMetrics = {inputTapeLength: 0, verificationDraws: 0, legacyPrefixDraws: 0};

    public getDiagnostics(): object {
        return {...this.tapeMetrics, ...this.runtime?.getDiagnostics()};
    }

    public async handle(request: PokieWasmWorkerRequest | unknown): Promise<PokieWasmWorkerResponse> {
        const id = workerRequestId(request);
        let runtimeOperationInvoked = false;
        try {
            assertValidWorkerRequest(request);
            if (request.type === "instantiate") {
                const generation = ++this.generation;
                const seed = request.seed;
                const metrics = {inputTapeLength: request.draws?.length ?? 0, verificationDraws: 0, legacyPrefixDraws: 0};
                const portableBytes = new Uint8Array(request.bytes);
                const host = request.draws === undefined ? new SeededPokieWasmHost(seed!) : await createTapeHost([...request.draws], seed, metrics);
                const runtime = await instantiatePokieWasm(portableBytes, request.manifest, host);
                const trace = request.traceCapacity === undefined ? undefined : new BoundedPokieWasmTraceCollector(request.traceCapacity);
                let session: ReturnType<PokieWasmRuntime["createSession"]>;
                try {
                    session = runtime.createSession(seed ?? "worker", {credits: request.credits, trace});
                } catch (error) {
                    runtime.dispose();
                    throw error;
                }
                if (generation !== this.generation) {
                    session.dispose();
                    runtime.dispose();
                    throw new Error("The WASM worker initialization was cancelled or replaced.");
                }
                // Only a fully instantiated replacement may release an active
                // session. Malformed/unsupported instantiate requests leave it
                // usable for the caller's next valid command.
                this.release();
                this.runtime = runtime;
                this.session = session;
                this.trace = trace;
                this.tapeMetrics = metrics;
                return {id: request.id, ok: true, result: runtime.manifest};
            }
            if (request.type === "cancel" || request.type === "dispose") {
                this.generation++;
                this.release();
                return {id: request.id, ok: true};
            }
            if (this.runtime === undefined) throw new Error("Instantiate a POKIE WASM runtime before sending this worker command.");
            if (request.type === "replay") {
                runtimeOperationInvoked = true;
                const trace = request.traceCapacity === undefined ? undefined : new BoundedPokieWasmTraceCollector(request.traceCapacity);
                const result = await this.runtime.replay(request.state, request.commands, {trace});
                return {id: request.id, ok: true, result: {...result, ...(trace === undefined ? {} : {trace: {entries: trace.entries, dropped: trace.dropped, status: trace.status}})}};
            }
            if (this.session === undefined) throw new Error("Instantiate a POKIE WASM runtime before sending this worker command.");
            if (request.type === "play") {
                if (!this.runtime.manifest.capabilities.includes("runtime.play")) {
                    throw new Error("POKIE WASM artifact does not declare runtime.play; it cannot play a session round.");
                }
                runtimeOperationInvoked = true;
                return {id: request.id, ok: true, result: await this.session.play(request.command)};
            }
            if (request.type === "restore") {
                const restored = this.runtime.restoreSession(request.state);
                this.session.dispose();
                this.session = restored;
                this.trace = undefined;
                return {id: request.id, ok: true, result: this.session.serialize()};
            }
            if (request.type === "trace") return {id: request.id, ok: true, result: this.trace === undefined ? null : {entries: this.trace.entries, dropped: this.trace.dropped, status: this.trace.status}};
            if (request.type === "serialize") return {id: request.id, ok: true, result: this.session.serialize()};
            throw new Error(`Unsupported POKIE WASM worker request type ${JSON.stringify(request.type)}.`);
        } catch (error) {
            // A WebAssembly trap poisons the instance whether it occurs while
            // playing or replaying. Declaration, protocol, and state errors
            // happen before a module trap, so callers can correct them and
            // continue using the active runtime.
            if (runtimeOperationInvoked && isWasmRuntimeTrap(error)) this.release();
            return {id, ok: false, error: error instanceof Error ? error.message : String(error)};
        }
    }

    private release(): void {
        this.session?.dispose();
        this.runtime?.dispose();
        this.session = undefined;
        this.runtime = undefined;
        this.trace = undefined;
        this.tapeMetrics = {inputTapeLength: 0, verificationDraws: 0, legacyPrefixDraws: 0};
    }
}

function isWasmRuntimeTrap(error: unknown): boolean {
    return error instanceof WebAssembly.RuntimeError;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function workerRequestId(value: unknown): string {
    return isRecord(value) && typeof value.id === "string" ? value.id : "protocol";
}

function assertValidWorkerRequest(value: unknown): asserts value is PokieWasmWorkerRequest {
    if (!isRecord(value) || typeof value.id !== "string" || value.id.trim().length === 0 || typeof value.type !== "string") {
        throw new Error("Malformed POKIE WASM worker request: expected a non-empty string id and request type.");
    }
    switch (value.type) {
        case "instantiate":
            if (!(value.bytes instanceof Uint8Array) || !isRecord(value.manifest) || (value.draws === undefined ? value.seed === undefined : !Array.isArray(value.draws)) ||
                (value.seed !== undefined && (typeof value.seed !== "string" || value.seed.length === 0)) ||
                (value.draws !== undefined && !(value.draws as unknown[]).every((draw) => typeof draw === "number" && Number.isFinite(draw) && draw >= 0 && draw < 1)) ||
                (value.credits !== undefined && (typeof value.credits !== "number" || !Number.isFinite(value.credits) || value.credits < 0)) || !validTraceCapacity(value.traceCapacity)) {
                throw new Error("Malformed POKIE WASM instantiate request: bytes, manifest, finite [0, 1) draws, and an optional non-empty seed are required.");
            }
            return;
        case "play":
            if (value.command !== undefined && !isRecord(value.command)) throw new Error("Malformed POKIE WASM play request: command must be an object when supplied.");
            return;
        case "restore":
            if (!isRecord(value.state)) throw new Error("Malformed POKIE WASM restore request: state must be an object.");
            return;
        case "serialize":
        case "trace":
        case "cancel":
        case "dispose":
            return;
        case "replay":
            if (!isRecord(value.state) || !Array.isArray(value.commands) || !value.commands.every(isRecord) || !validTraceCapacity(value.traceCapacity)) {
                throw new Error("Malformed POKIE WASM replay request: state and command objects are required.");
            }
            return;
        default:
            throw new Error(`Unsupported POKIE WASM worker request type ${JSON.stringify(value.type)}.`);
    }
}

function validTraceCapacity(value: unknown): boolean {
    return value === undefined || (typeof value === "number" && Number.isSafeInteger(value) && value > 0);
}

/** Explicit input evidence stays owned once; snapshots carry only its fingerprint and cursor. */
async function createTapeHost(draws: readonly number[], seed: string | undefined, metrics: {verificationDraws: number; legacyPrefixDraws: number}): Promise<PokieWasmHost> {
    const tapeHash = await sha256CanonicalWasmBytes(new TextEncoder().encode(JSON.stringify(draws)));
    const seeded = seed === undefined ? undefined : new SeededPokieWasmHost(seed);
    const origin = seeded?.serializeState() as number | undefined;
    let cursor = 0;
    const expectedRng = (position: number): number => (origin! + Math.imul(position >>> 0, 0x6d2b79f5)) >>> 0;
    const validatePrefix = (position: number): void => {
        if (seeded === undefined) return;
        const verifier = new SeededPokieWasmHost(seed!);
        for (let index = 0; index < position; index++) {
            metrics.legacyPrefixDraws++;
            if (verifier.nextRandom() !== draws[index]) throw new Error("The WASM worker received draws that do not match its explicit seeded host stream.");
        }
    };
    return {
        nextRandom: () => {
            const draw = draws[cursor];
            if (draw === undefined) throw new Error("The WASM worker received no host-provided random draw.");
            if (seeded !== undefined) {
                metrics.verificationDraws++;
                if (seeded.nextRandom() !== draw) throw new Error("The WASM worker received draws that do not match its explicit seeded host stream.");
            }
            cursor++;
            return draw;
        },
        ...(seeded === undefined ? {resetInitialState: () => {
            cursor = 0;
        }} : {
            resetSeed: (requestedSeed: string) => {
                if (requestedSeed !== seed) throw new Error("The WASM worker seed does not match its supplied draw stream.");
                seeded.resetSeed(requestedSeed);
                cursor = 0;
            },
        }),
        serializeState: () => ({version: "pokie.worker.v2", cursor, tapeHash, tapeLength: draws.length, seed: seed ?? null, rng: seeded?.serializeState() ?? null}),
        restoreState: (state: PokieWasmHostState) => {
            if (typeof state === "number" && seeded !== undefined) {
                let position = 0;
                while (expectedRng(position) !== state && position < draws.length) position++;
                if (expectedRng(position) !== state) throw new Error("Invalid or incompatible WASM worker seeded continuation.");
                validatePrefix(position);
                seeded.restoreState(state);
                cursor = position;
                return;
            }
            if (!isRecord(state) || typeof state.cursor !== "number" ||
                !Number.isSafeInteger(state.cursor) || state.cursor < 0 || state.cursor > draws.length || state.seed !== (seed ?? null)) {
                throw new Error("Invalid or incompatible WASM worker draw continuation.");
            }
            if (state.version === "pokie.worker.v2") {
                if (state.tapeHash !== tapeHash || state.tapeLength !== draws.length) throw new Error("Invalid or incompatible WASM worker draw continuation.");
            } else {
                if (state.version !== undefined) throw new Error("Unsupported WASM worker continuation version.");
                if (state.tape !== JSON.stringify(draws)) throw new Error("Invalid or incompatible WASM worker draw continuation.");
                validatePrefix(state.cursor);
            }
            if (seeded !== undefined) {
                if (expectedRng(state.cursor) !== state.rng) throw new Error("Invalid WASM worker seeded continuation.");
                seeded.restoreState(state.rng as PokieWasmHostState);
            } else if (state.rng !== null) throw new Error("Invalid WASM worker unseeded continuation.");
            cursor = state.cursor;
        },
    };
}
