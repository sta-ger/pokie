import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";

/** Version implemented by every direct portable POKIE WASM runtime entry point. */
export const POKIE_WASM_RUNTIME_VERSION = "1.3.0";
/** The same initial session ledger used by an ordinary POKIE game session. */
export const POKIE_WASM_DEFAULT_CREDITS = 1000;

/** Runtime-owned continuation contains no historical evidence. Artifact ABI remains v1. */
export type PokieWasmSessionState = {
    readonly schemaVersion: "pokie.state.v2";
    readonly seed: string;
    /** Total consumed draws, including unpaid seeded initialization. */
    readonly drawCount: number;
    readonly sequence: number;
    readonly credits: number;
    readonly rngState?: PokieWasmHostState;
};
/** v1 draws always means complete consumed history; importing omits that evidence. */
export type PokieWasmLegacySessionState = {
    readonly schemaVersion: "pokie.state.v1";
    readonly seed: string;
    readonly draws: readonly number[];
    readonly sequence: number;
    readonly credits: number;
    readonly rngState?: PokieWasmHostState;
};
export type PokieWasmRestorableState = PokieWasmSessionState | PokieWasmLegacySessionState;
export const POKIE_WASM_RUNTIME_API_VERSION = "1.2.0";

export type PokieWasmTraceEntry = {
    readonly kind: "initialization" | "round" | "replay";
    readonly sequence: number;
    readonly draws: readonly number[];
};
export interface PokieWasmTraceCollecting {
    readonly capacity: number;
    readonly dropped: number;
    readonly status: "open" | "completed" | "disposed";
    readonly entries: readonly PokieWasmTraceEntry[];
    record(entry: PokieWasmTraceEntry): void;
    complete(): void;
    dispose(): void;
}
/** Finite drop-newest evidence, detached on read. No callbacks, queues or sink failures.
 * One collector belongs to one session/replay. Attachment never backfills history.
 */
export class BoundedPokieWasmTraceCollector implements PokieWasmTraceCollecting {
    public readonly capacity: number;
    private buffer: PokieWasmTraceEntry[] = [];
    private droppedCount = 0;
    private lifecycle: "open" | "completed" | "disposed" = "open";

    public constructor(capacity: number) {
        if (!Number.isSafeInteger(capacity) || capacity < 1) throw new Error("WASM trace capacity must be a positive safe integer.");
        this.capacity = capacity;
        Reflect.defineProperty(this, "capacity", {value: capacity, enumerable: true, writable: false, configurable: false});
    }
    public get dropped(): number {
        return this.droppedCount;
    }
    public get status(): "open" | "completed" | "disposed" {
        return this.lifecycle;
    }
    public get entries(): readonly PokieWasmTraceEntry[] {
        return this.buffer.map(entry => ({...entry, draws: [...entry.draws]}));
    }
    public record(entry: PokieWasmTraceEntry): void {
        if (this.lifecycle !== "open") return;
        if (this.buffer.length === this.capacity) {
            this.droppedCount++;
            return;
        }
        this.buffer.push({...entry, draws: [...entry.draws]});
    }
    public complete(): void {
        if (this.lifecycle === "open") this.lifecycle = "completed";
    }
    public dispose(): void {
        this.buffer = [];
        this.lifecycle = "disposed";
    }
}
export type PokieWasmTraceOptions = {readonly trace?: BoundedPokieWasmTraceCollector};
export type PokieWasmRuntimeDiagnostics = {
    readonly generatedDraws: number;
    readonly hostRestorations: number;
    readonly hostPayloadBytes: number;
    readonly snapshotPayloadBytes: number;
};
export type PokieWasmHostState = string | number | boolean | null | readonly PokieWasmHostState[] | {readonly [key: string]: PokieWasmHostState};
export type PokieWasmHost = {
    readonly nextRandom: () => number;
    /** Starts a public seeded session. Hosts without this keep their live stream. */
    readonly resetSeed?: (seed: string) => void;
    /** Restores a legacy empty initial snapshot for a host with a known origin. */
    readonly resetInitialState?: () => void;
    /** Caller-owned continuation must itself be bounded; arbitrary JSON can retain history.
     * Optional JSON-safe continuation required to restore this stream in a fresh runtime. */
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
    setTraceCollector(trace?: BoundedPokieWasmTraceCollector): void;
    dispose(): void;
};
/**
 * Replay owns its deterministic execution and returns its own continuation;
 * this is not the separately declared session serialize/restore operation.
 */
export type PokieWasmReplayResult = {
    /** Replay rounds are an explicit wire field, safe for JSON and Worker cloning. */
    readonly rounds: readonly PokieWasmRound[];
    readonly stateBeforeFinal?: PokieWasmSessionState;
    readonly stateAfter: PokieWasmSessionState;
};
export type PokieWasmRuntime = {
    readonly manifest: PokieWasmComponentManifest;
    getDiagnostics(): PokieWasmRuntimeDiagnostics;
    createSession(seed: string, options?: {readonly credits?: number} & PokieWasmTraceOptions): PokieWasmRuntimeSession;
    restoreSession(state: PokieWasmRestorableState, options?: PokieWasmTraceOptions): PokieWasmRuntimeSession;
    replay(state: PokieWasmRestorableState, commands: readonly Record<string, unknown>[], options?: PokieWasmTraceOptions): Promise<PokieWasmReplayResult>;
    dispose(): void;
};
