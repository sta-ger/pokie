import type {GameSessionIdentity} from "../runtime/GameSessionIdentity.js";
import type {SessionStateSchema} from "../session/SessionStateRestoring.js";
import type {PokieGameContext} from "../gamepackage/PokieGameContext.js";
import type {SessionCommand} from "../runtime/SessionCommand.js";
import type {SessionCommandResult} from "../runtime/SessionRuntimeHandling.js";
import type {LogicalRound} from "../runtime/LogicalRound.js";
import type {RoundArtifactJson} from "../artifact/RoundArtifactJson.js";

/** Executable inputs, distinct from presentation serialization and from portable WASM state. */
export type AuditBoundary = {
    readonly state: unknown;
    readonly bet: number;
    readonly credits: number;
    readonly logicalRound?: LogicalRound;
};
export type AuditDisposition = {
    readonly status: "calculated" | "committed" | "compensated" | "rejected" | "pending" | "recovery-required";
    readonly sessionId: string;
    readonly requestId?: string;
    readonly attemptId?: string;
    readonly startedAt?: string;
    readonly recordedAt?: string;
    readonly expectedVersion?: number;
    readonly version?: number;
    readonly debitTransactionId?: string;
    readonly creditTransactionId?: string;
    readonly walletPayout?: number;
    readonly walletCredits?: number;
    readonly durability: "detached" | "process-only" | "atomic-local" | "external-provider" | "independent-ports";
};
export type AuditDelivery = {
    readonly execution: "command" | "accepted-boundary";
    readonly command: SessionCommand;
    readonly before: AuditBoundary;
    readonly after: AuditBoundary;
    readonly result: Extract<SessionCommandResult, {status: "played"}>;
    readonly artifact?: RoundArtifactJson;
    readonly disposition: AuditDisposition;
};
/** Hash integrity and deterministic reproduction, not a signature or proof of authenticity. */
export type AuditRoundRecording = {
    readonly schemaVersion: "pokie.audit-round.v1";
    readonly runtimeVersion: "pokie.session-runtime.v1";
    readonly identity: GameSessionIdentity;
    readonly game: {id: string; name: string; version: string};
    readonly stateSchema: SessionStateSchema;
    readonly rngProfile: "seeded-mulberry32-v1" | "custom-codec-v1" | "none";
    readonly context?: PokieGameContext;
    readonly deliveries: readonly AuditDelivery[];
    readonly hash: string;
};
