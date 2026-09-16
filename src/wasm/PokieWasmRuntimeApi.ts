import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";

/** Browser-safe, JSON-only public contract for a canonical POKIE component. */
export type PokieWasmSessionState = {readonly schemaVersion: "pokie.state.v1"; readonly seed: string; readonly draws: readonly number[]; readonly sequence: number};
export const POKIE_WASM_RUNTIME_API_VERSION = "1.0.0";
export type PokieWasmHost = {readonly nextRandom: () => number};
export type PokieWasmRuntimeSession = {
    play(command?: Record<string, unknown>): Promise<{readonly sequence: number; readonly draw: number; readonly gameValue: number; readonly command: Record<string, unknown>}>;
    serialize(): PokieWasmSessionState;
    dispose(): void;
};
export type PokieWasmRuntime = {
    readonly manifest: PokieWasmComponentManifest;
    createSession(seed: string): PokieWasmRuntimeSession;
    restoreSession(state: PokieWasmSessionState): PokieWasmRuntimeSession;
    replay(state: PokieWasmSessionState, commands: readonly Record<string, unknown>[]): Promise<readonly {readonly sequence: number; readonly draw: number; readonly gameValue: number; readonly command: Record<string, unknown>}[]>;
    dispose(): void;
};
