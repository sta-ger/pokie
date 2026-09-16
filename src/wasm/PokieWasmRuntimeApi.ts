import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";

/** Browser-safe, JSON-only public contract for a canonical POKIE component. */
export type PokieWasmSessionState = {readonly schemaVersion: "pokie.state.v1"; readonly seed: string; readonly draws: readonly number[]; readonly sequence: number};
export const POKIE_WASM_RUNTIME_API_VERSION = "1.0.0";
export type PokieWasmHost = {readonly nextRandom: () => number};
export type PokieWasmRound = {
    readonly sequence: number;
    readonly draw: number;
    readonly stops: readonly number[];
    readonly screen: readonly (readonly string[])[];
    readonly winMultiplier: number;
    readonly payout: number;
    readonly command: Record<string, unknown>;
};
export type PokieWasmRuntimeSession = {
    play(command?: Record<string, unknown>): Promise<PokieWasmRound>;
    serialize(): PokieWasmSessionState;
    dispose(): void;
};
export type PokieWasmRuntime = {
    readonly manifest: PokieWasmComponentManifest;
    createSession(seed: string): PokieWasmRuntimeSession;
    restoreSession(state: PokieWasmSessionState): PokieWasmRuntimeSession;
    replay(state: PokieWasmSessionState, commands: readonly Record<string, unknown>[]): Promise<readonly PokieWasmRound[]>;
    dispose(): void;
};
