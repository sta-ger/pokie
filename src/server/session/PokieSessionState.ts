import type {LogicalRoundStatistics} from "../../simulation/LogicalRoundStatistics.js";
import type {LogicalRound} from "../../runtime/LogicalRound.js";
import type {ScreenGeometry} from "../../session/videoslot/coordinates/ScreenGeometry.js";
import type {SessionStateSchema} from "../../session/SessionStateRestoring.js";
import type {GameSessionIdentity} from "../../runtime/GameSessionIdentity.js";
import type {PokieGameContext} from "../../gamepackage/PokieGameContext.js";
import type {RoundArtifact} from "../../artifact/RoundArtifact.js";
import type {SessionCapturePolicy} from "./SessionCapturePolicy.js";

export type PokieSessionState = {
    logicalRound?: LogicalRound;
    /** Last charged entry, retained across ordinary zero-stake continuations independently of selection. */
    chargedEntry?: {readonly bet: number; readonly mode?: string};
    /** Compact permanent entry identities; full historical outputs belong to result storage. */
    logicalRoundIds?: readonly string[];
    logicalRoundDeliverySupported?: boolean;
    logicalRoundStatistics?: LogicalRoundStatistics;
    identity?: GameSessionIdentity;
    stateSchema?: SessionStateSchema;
    credits?: number;
    commandCapabilities?: {readonly bets: readonly number[]; readonly modes?: readonly string[]};
    context?: PokieGameContext;
    bet: number;
    win: number;
    screen?: unknown[][];
    /** Required internal coordinate evidence; never part of a public response or optional debug bag. */
    coordinates?: {geometry: ScreenGeometry; generatedScreen: unknown[][]};
    // Private executable state, interpreted by the selected game's complete codec and validated
    // against stateSchema before execution or recovery. Snapshot-only games stay live-only.
    featureState?: unknown;
    // New captures always mark capability explicitly. Durable restoration requires an explicit
    // completeness promise, a nonmutating validator and capture/restore methods covering all
    // collaborators. Fields remain optional only so storage readers can inspect historical records;
    // the command runtime rejects incomplete records instead of silently rebuilding defaults.
    executionState?: "durably-restorable" | "live-only";
    // Present only when the loaded PokieGame implements the optional getSessionSerializer() —
    // captured once, at session creation, from that serializer's getInitialData(session) (see
    // captureInitialPokieSessionState.ts). Carried forward unchanged on every subsequent spin (see
    // captureRoundPokieSessionState.ts) — a session's descriptive data (paytable, availableSymbols,
    // linesDefinitions, ...) doesn't change between rounds, so it's never recomputed after creation.
    initialPayload?: Record<string, unknown>;
    // Present only when the loaded PokieGame implements getSessionSerializer() AND at least one spin
    // has happened — that serializer's getRoundData(session) output from the *last* spin (see
    // captureRoundPokieSessionState.ts). Replaced on every spin; never present on a freshly created
    // session's own state.
    roundPayload?: Record<string, unknown>;
    // Present only when the serializer implements the optional
    // GameSessionSerializing.getInitialDebugData(). Captured once at session creation and carried
    // forward unchanged, same lifecycle as initialPayload above. Never part of a public response —
    // see PokieDevServer's public/internal split.
    initialDebugPayload?: Record<string, unknown>;
    // Present only when the serializer implements the optional
    // GameSessionSerializing.getRoundDebugData() AND at least one spin has happened. Replaced on
    // every spin, same lifecycle as roundPayload above. Never part of a public response — see
    // PokieDevServer's public/internal split.
    roundDebugPayload?: Record<string, unknown>;
    // The SessionCapturePolicy (see SessionCapturePolicy.ts) that produced this particular round
    // capture — present only from the first captureRoundPokieSessionState call a session goes through
    // onward (session-creation's own captureInitialPokieSessionState never sets it: there's no "round"
    // yet to have a capture mode for). Absent entirely on a legacy record captured before this policy
    // existed — never backfilled or guessed at, so a reader can reliably tell "this state predates
    // capture policies" apart from "this state was captured under an explicit partial policy".
    capturePolicy?: SessionCapturePolicy;
    // Present only when capturePolicy.mode === "full" AND the played session's shape supported building
    // one (see captureRoundPokieSessionState.ts) — a complete, hashable RoundArtifact for this exact
    // round, built straight off the same already-computed win-evaluation result the round itself used
    // (see buildRoundArtifactFromSession), never a second calculation path.
    roundArtifact?: RoundArtifact;
    // Present only when capturePolicy.mode === "full" but roundArtifact above could not be built —
    // e.g. the session doesn't implement the VideoSlotSessionHandling shape buildRoundArtifactFromSession
    // requires. An honest diagnostic of *why* no artifact exists, never a fabricated/placeholder one.
    roundArtifactUnavailableReason?: string;
};
