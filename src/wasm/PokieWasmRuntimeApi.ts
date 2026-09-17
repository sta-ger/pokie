import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";

/** Version implemented by every direct portable POKIE WASM runtime entry point. */
export const POKIE_WASM_RUNTIME_VERSION = "1.3.0";
/** The same initial session ledger used by an ordinary POKIE game session. */
export const POKIE_WASM_DEFAULT_CREDITS = 1000;

/** Browser-safe, JSON-only public contract for a canonical POKIE component. */
export type PokieWasmSessionState = {
    readonly schemaVersion: "pokie.state.v1";
    readonly seed: string;
    /** Every seeded host draw consumed to select canonical reel stops. */
    readonly draws: readonly number[];
    readonly sequence: number;
    /** Remaining session ledger after the last completed round. */
    readonly credits: number;
    /** JSON-safe host RNG continuation, when the host supports restoration. */
    readonly rngState?: PokieWasmHostState;
};
export const POKIE_WASM_RUNTIME_API_VERSION = "1.0.0";
export type PokieWasmHostState = string | number | boolean | null | readonly PokieWasmHostState[] | {readonly [key: string]: PokieWasmHostState};
export type PokieWasmHost = {
    readonly nextRandom: () => number;
    /** Optional JSON-safe continuation required to restore this stream in a fresh runtime. */
    readonly serializeState?: () => PokieWasmHostState;
    readonly restoreState?: (state: PokieWasmHostState) => void;
};
export type PokieWasmRound = {
    readonly sequence: number;
    readonly draw: number;
    readonly stops: readonly number[];
    readonly screen: readonly (readonly string[])[];
    readonly winMultiplier: number;
    /** The resolved command stake used to calculate payout. */
    readonly stake: number;
    readonly payout: number;
    /** Ledger before settling this round's stake and payout. */
    readonly creditsBefore: number;
    /** Ledger after settling this round's stake and payout. */
    readonly credits: number;
    readonly command: Record<string, unknown>;
};
export type PokieWasmRuntimeSession = {
    play(command?: Record<string, unknown>): Promise<PokieWasmRound>;
    serialize(): PokieWasmSessionState;
    dispose(): void;
};
/**
 * Replay owns its deterministic execution and returns its own continuation;
 * this is not the separately declared session serialize/restore operation.
 */
export type PokieWasmReplayResult = readonly PokieWasmRound[] & {
    readonly stateBeforeFinal?: PokieWasmSessionState;
    readonly stateAfter: PokieWasmSessionState;
};
export type PokieWasmRuntime = {
    readonly manifest: PokieWasmComponentManifest;
    createSession(seed: string, options?: {readonly credits?: number}): PokieWasmRuntimeSession;
    restoreSession(state: PokieWasmSessionState): PokieWasmRuntimeSession;
    replay(state: PokieWasmSessionState, commands: readonly Record<string, unknown>[]): Promise<PokieWasmReplayResult>;
    dispose(): void;
};
