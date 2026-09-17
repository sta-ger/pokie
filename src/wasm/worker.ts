import {instantiatePokieWasm, SeededPokieWasmHost} from "./PokieWasmRuntime.js";
import type {PokieWasmRuntime, PokieWasmSessionState} from "./PokieWasmRuntimeApi.js";
import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";

export type PokieWasmWorkerRequest =
    | {readonly id: string; readonly type: "instantiate"; readonly bytes: Uint8Array; readonly manifest: PokieWasmComponentManifest; readonly draws: readonly number[]; readonly seed?: string}
    | {readonly id: string; readonly type: "play"; readonly command?: Record<string, unknown>}
    | {readonly id: string; readonly type: "restore"; readonly state: PokieWasmSessionState}
    | {readonly id: string; readonly type: "serialize"}
    | {readonly id: string; readonly type: "replay"; readonly state: PokieWasmSessionState; readonly commands: readonly Record<string, unknown>[]}
    | {readonly id: string; readonly type: "cancel"}
    | {readonly id: string; readonly type: "dispose"};
export type PokieWasmWorkerResponse = {readonly id: string; readonly ok: true; readonly result?: unknown} | {readonly id: string; readonly ok: false; readonly error: string};

/** State owner used by a real Web Worker entry or directly by browser hosts. */
export class PokieWasmWorkerProtocol {
    private runtime: PokieWasmRuntime | undefined;
    private session: ReturnType<PokieWasmRuntime["createSession"]> | undefined;

    public async handle(request: PokieWasmWorkerRequest | unknown): Promise<PokieWasmWorkerResponse> {
        const id = workerRequestId(request);
        let runtimeOperationInvoked = false;
        try {
            assertValidWorkerRequest(request);
            if (request.type === "instantiate") {
                const draws = [...request.draws];
                const portableBytes = new Uint8Array(request.bytes.byteLength);
                portableBytes.set(request.bytes);
                const seededHost = request.seed === undefined ? undefined : new SeededPokieWasmHost(request.seed);
                const runtime = await instantiatePokieWasm(portableBytes, request.manifest, {nextRandom: () => {
                    const draw = draws.shift();
                    if (draw === undefined) throw new Error("The WASM worker received no host-provided random draw.");
                    if (seededHost !== undefined && seededHost.nextRandom() !== draw) {
                        throw new Error("The WASM worker received draws that do not match its explicit seeded host stream.");
                    }
                    return draw;
                },
                ...(seededHost === undefined ? {} : {
                    serializeState: () => seededHost.serializeState(),
                    restoreState: (state) => seededHost.restoreState(state),
                })});
                let session: ReturnType<PokieWasmRuntime["createSession"]>;
                try {
                    session = runtime.createSession(request.seed ?? "worker");
                } catch (error) {
                    runtime.dispose();
                    throw error;
                }
                // Only a fully instantiated replacement may release an active
                // session. Malformed/unsupported instantiate requests leave it
                // usable for the caller's next valid command.
                this.release();
                this.runtime = runtime;
                this.session = session;
                return {id: request.id, ok: true, result: runtime.manifest};
            }
            if (this.runtime === undefined) throw new Error("Instantiate a POKIE WASM runtime before sending this worker command.");
            if (request.type === "replay") {
                runtimeOperationInvoked = true;
                return {id: request.id, ok: true, result: await this.runtime.replay(request.state, request.commands)};
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
                return {id: request.id, ok: true, result: this.session.serialize()};
            }
            if (request.type === "serialize") return {id: request.id, ok: true, result: this.session.serialize()};
            if (request.type === "cancel" || request.type === "dispose") {
                this.release();
                return {id: request.id, ok: true};
            }
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
            if (!(value.bytes instanceof Uint8Array) || !isRecord(value.manifest) || !Array.isArray(value.draws) ||
                (value.seed !== undefined && (typeof value.seed !== "string" || value.seed.length === 0)) ||
                !value.draws.every((draw) => typeof draw === "number" && Number.isFinite(draw) && draw >= 0 && draw < 1)) {
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
        case "cancel":
        case "dispose":
            return;
        case "replay":
            if (!isRecord(value.state) || !Array.isArray(value.commands) || !value.commands.every(isRecord)) {
                throw new Error("Malformed POKIE WASM replay request: state and command objects are required.");
            }
            return;
        default:
            throw new Error(`Unsupported POKIE WASM worker request type ${JSON.stringify(value.type)}.`);
    }
}
