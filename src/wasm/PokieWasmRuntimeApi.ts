import type {PokieWasmComponentManifest} from "../project/wasm/PokieWasmComponentManifest.js";

/** Version implemented by every direct portable POKIE WASM runtime entry point. */
export const POKIE_WASM_RUNTIME_VERSION = "1.3.0";
/** The same initial session ledger used by an ordinary POKIE game session. */
export const POKIE_WASM_DEFAULT_CREDITS = 1000;

/** Runtime-owned continuation contains no historical evidence. Artifact ABI is v3. */
export type PokieWasmOrdinarySessionState = {
    readonly schemaVersion: "pokie.state.v3";
    readonly artifactIdentity: string;
    readonly seed: string;
    /** Total consumed draws, including unpaid seeded initialization. */
    readonly drawCount: number;
    readonly sequence: number;
    readonly credits: number;
    readonly rngState?: PokieWasmHostState;
};
/** Artifact-bound feature continuation retains one delivery, never a completed history. */
export type PokieWasmFeatureSessionState = Omit<PokieWasmOrdinarySessionState, "schemaVersion"> & {
    readonly schemaVersion: "pokie.state.v4";
    readonly feature: {
        readonly bet: number;
        readonly state: unknown;
        readonly initialStops?: readonly number[];
        readonly logicalRound?: import("../runtime/LogicalRound.js").LogicalRound;
        readonly lastRound?: PokieWasmRound;
        /** Starting totals for the sole retained composite continuation, never delivery history. */
        readonly deliveryStart?: {readonly cursor: number; readonly credits: number; readonly totalStake: number; readonly totalWin: number; readonly totalPayout: number};
        /** Accepted mathematics preceding the final subround in this composite request. */
        readonly deliveryPrefix?: {readonly stake: number; readonly win: number; readonly payout: number};
        /** Plain commands use the same mathematical artifact contract without logical cursors. */
        readonly plainMath?: {readonly command: import("../runtime/SessionCommand.js").SessionCommand; readonly finalScreen?: readonly (readonly string[])[]; readonly artifact: import("../artifact/RoundArtifact.js").RoundArtifact; readonly payout: number; readonly credits: number};
        readonly pendingCommand?: {readonly command: import("../runtime/SessionCommand.js").SessionCommand; readonly advanced: number};
        /** Accepted underlying legacy display amounts; zero multipliers cannot be inverted. */
        readonly componentAmounts?: {readonly ways: readonly number[]; readonly clusters: readonly number[]};
        /** Input to the sole latest accepted analytics transition; replaced, never accumulated. */
        readonly analyticsCheckpoint?: {readonly state: import("../simulation/SessionFeatureAnalyticsObserver.js").SessionFeatureAnalyticsState; readonly before: import("../simulation/SessionFeatureAnalyticsObserver.js").SessionFeatureAnalyticsBeforePlay};
        readonly analytics?: import("../simulation/SessionFeatureAnalyticsObserver.js").SessionFeatureAnalyticsState;
    };
};
export type PokieWasmSessionState = PokieWasmOrdinarySessionState | PokieWasmFeatureSessionState;
/** v1 draws always means complete consumed history; importing omits that evidence. */
export type PokieWasmLegacySessionState = {
    readonly schemaVersion: "pokie.state.v1";
    readonly seed: string;
    readonly draws: readonly number[];
    readonly sequence: number;
    readonly credits: number;
    readonly rngState?: PokieWasmHostState;
};
/** Only an empty v2 origin is accepted; later unbound compact snapshots must be regenerated. */
export type PokieWasmInitialCompactState = Omit<PokieWasmOrdinarySessionState, "schemaVersion" | "artifactIdentity"> & {readonly schemaVersion: "pokie.state.v2"};
export type PokieWasmRestorableState = PokieWasmSessionState | PokieWasmLegacySessionState | PokieWasmInitialCompactState;
export const POKIE_WASM_RUNTIME_API_VERSION = "2.1.0";

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
    /** Mathematical award differs from wallet release during banked features. */
    readonly win?: number;
    readonly analytics?: import("../simulation/FeatureAnalytics.js").FeatureAnalyticsObservation;
    /** Finite composite response evidence, omitted from compact continuation. */
    readonly deliveries?: readonly PokieWasmRound[];
    readonly deliveryOnly?: boolean;
    readonly logicalRound?: import("../runtime/LogicalRound.js").LogicalRound;
    readonly network?: import("../net/videoslot/VideoSlotNetworkData.js").VideoSlotRoundNetworkData;
    readonly sequenceSelections?: readonly import("../session/videoslot/combinations/WeightedSequenceVariant.js").ReelSequenceSelection[];
    readonly sequenceStatistics?: readonly import("../session/videoslot/combinations/WeightedSequenceVariant.js").ReelSequenceStatistics[];
    readonly weightedBonusStatistics?: import("../session/videoslot/authored/WeightedBonus.js").WeightedBonusStatistics;

};
export type PokieWasmRuntimeSession = {
    play(command?: Record<string, unknown>, options?: {readonly signal?: AbortSignal}): Promise<PokieWasmRound>;
    serialize(): PokieWasmSessionState;
    getInitialData?(): import("../net/videoslot/VideoSlotNetworkData.js").VideoSlotInitialNetworkData;
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
    getBetModes?(): readonly import("../gamepackage/BetMode.js").BetMode[];
    createSession(seed: string, options?: {readonly credits?: number} & PokieWasmTraceOptions): PokieWasmRuntimeSession;
    restoreSession(state: PokieWasmRestorableState, options?: PokieWasmTraceOptions): PokieWasmRuntimeSession;
    replay(state: PokieWasmRestorableState, commands: readonly Record<string, unknown>[], options?: PokieWasmTraceOptions): Promise<PokieWasmReplayResult>;
    dispose(): void;
};

// Browser-safe prose shared by the product contract and Studio. This describes
// current mechanics, not a capability grant or a compiler acceptance test.
export const WASM_EXECUTION_BOUNDARY = "Shared execution: generated Node and portable artifacts use the same pokie.math.v2 WebAssembly evaluator (ABI 3.0), with the same declarative session decorators for feature progression and settlement. Supports lines/ways/clusters, all 36 launch catalogue rows, compatible weighted whole sequences, projections, explicit bet modes, and stepwise/composite delivery. Ordinary play selects stops in WASM; feature orchestration uses the shared contextual generator and evaluates its projected/modified screens in WASM. Host owns RNG continuation, ledger and IO. Limits: 64 reels, 64 evaluation rows, 1024 evaluation cells, 128 symbols, 1024 paylines, 65536 stops per reel, 262144 total stops and 8 MiB evaluator memory; no total-bit cap across reels. Feature state v4 binds compact executable progress and the latest delivery to the artifact; ordinary state v3 remains compact. Feature execution requires a bounded serializable/restorable RNG host. Custom callbacks, custom evaluators/generators, opaque wrappers and external wallet/shared-progressive services are unsupported. Incompatible mechanic compositions remain errors. Blueprint is canonical; supported PAR and complete declared public package models use model-preserving extraction. Arbitrary TypeScript/Node behavior is not compiled. Legacy metadata-only components remain inspection-only.";
