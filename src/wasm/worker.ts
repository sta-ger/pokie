import {instantiatePokieWasm} from "./PokieWasmRuntime.js";
import type {PokieWasmRuntime, PokieWasmSessionState} from "./PokieWasmRuntimeApi.js";
import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";

export type PokieWasmWorkerRequest =
    | {readonly id: string; readonly type: "instantiate"; readonly bytes: Uint8Array; readonly manifest: PokieWasmComponentManifest; readonly draws: readonly number[]}
    | {readonly id: string; readonly type: "play"; readonly command?: Record<string, unknown>}
    | {readonly id: string; readonly type: "restore"; readonly state: PokieWasmSessionState}
    | {readonly id: string; readonly type: "serialize"}
    | {readonly id: string; readonly type: "cancel"}
    | {readonly id: string; readonly type: "dispose"};
export type PokieWasmWorkerResponse = {readonly id: string; readonly ok: true; readonly result?: unknown} | {readonly id: string; readonly ok: false; readonly error: string};

/** State owner used by a real Web Worker entry or directly by browser hosts. */
export class PokieWasmWorkerProtocol {
    private runtime: PokieWasmRuntime | undefined;
    private session: ReturnType<PokieWasmRuntime["createSession"]> | undefined;

    public async handle(request: PokieWasmWorkerRequest): Promise<PokieWasmWorkerResponse> {
        try {
            if (request.type === "instantiate") {
                const draws = [...request.draws];
                this.release();
                const portableBytes = new Uint8Array(request.bytes.byteLength);
                portableBytes.set(request.bytes);
                this.runtime = await instantiatePokieWasm(portableBytes, request.manifest, {nextRandom: () => {
                    const draw = draws.shift();
                    if (draw === undefined) throw new Error("The WASM worker received no host-provided random draw.");
                    return draw;
                }});
                this.session = this.runtime.createSession("worker");
                return {id: request.id, ok: true, result: this.runtime.manifest};
            }
            if (this.runtime === undefined || this.session === undefined) throw new Error("Instantiate a POKIE WASM runtime before sending this worker command.");
            if (request.type === "play") return {id: request.id, ok: true, result: await this.session.play(request.command)};
            if (request.type === "restore") {
                const restored = this.runtime.restoreSession(request.state);
                this.session.dispose();
                this.session = restored;
                return {id: request.id, ok: true, result: this.session.serialize()};
            }
            if (request.type === "serialize") return {id: request.id, ok: true, result: this.session.serialize()};
            this.release();
            return {id: request.id, ok: true};
        } catch (error) {
            if (request.type === "play") this.release();
            return {id: request.id, ok: false, error: error instanceof Error ? error.message : String(error)};
        }
    }

    private release(): void {
        this.session?.dispose();
        this.runtime?.dispose();
        this.session = undefined;
        this.runtime = undefined;
    }
}
