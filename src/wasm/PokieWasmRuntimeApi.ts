import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";

/** Browser-safe, JSON-only public contract for a canonical POKIE component. */
export type PokieWasmSessionState = {readonly schemaVersion: "pokie.state.v1"; readonly seed: string; readonly draws: readonly number[]; readonly sequence: number};
export type PokieWasmHost = {readonly nextRandom: () => number};
export type PokieWasmRuntimeSession = {
    play(command?: Record<string, unknown>): Promise<{readonly sequence: number; readonly draw: number; readonly command: Record<string, unknown>}>;
    serialize(): PokieWasmSessionState;
    dispose(): void;
};
export type PokieWasmRuntime = {
    readonly manifest: PokieWasmComponentManifest;
    createSession(seed: string): PokieWasmRuntimeSession;
    restoreSession(state: PokieWasmSessionState): PokieWasmRuntimeSession;
    dispose(): void;
};
