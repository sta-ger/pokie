import type {WeightedOutcomeLibrary} from "../weightedoutcome/WeightedOutcomeLibrary.js";
import type {IdempotencyRepository} from "./idempotency/IdempotencyRepository.js";
import type {PreGeneratedSessionRepository} from "./pregenerated/PreGeneratedSessionRepository.js";
import type {PreGeneratedSpinCommandResult} from "./pregenerated/PreGeneratedSpinCommandResult.js";
import type {SessionCaptureMode} from "./session/SessionCapturePolicy.js";
import type {SessionRepository} from "./session/SessionRepository.js";
import type {SpinCommandResult} from "./spin/SpinCommandResult.js";
import type {SpinOperationLog} from "./spin/SpinOperationLog.js";
import type {WalletPort} from "./wallet/WalletPort.js";

export type PokieDevServerOptions = {
    host?: string;
    port?: number;
    sessionRepository?: SessionRepository;
    wallet?: WalletPort;
    idempotencyRepository?: IdempotencyRepository<SpinCommandResult>;
    // Additive, opt-in-only: what SpinCommandHandler checkpoints each requestId-bearing spin attempt's
    // own progress to, for reconciliation/retry recovery after an interrupted attempt (see
    // SpinCommandHandler's own doc comment). Defaults to an in-memory log, the same "lost on a
    // crash/restart" tradeoff idempotencyRepository's own default already has — a deployment that needs
    // this to survive a crash must provide a durable implementation itself.
    spinOperationLog?: SpinOperationLog;
    // Additive, opt-in-only, defaults to false: certifies that this PokieDevServer's own SpinCommandHandler
    // is the *sole* one — in this process or any other — ever operating against sessionRepository/wallet/
    // idempotencyRepository/spinOperationLog, which is what makes it safe for a retried requestId's own
    // interrupted prior attempt to be automatically reversed/resumed rather than reported as needing
    // manual recovery (see SpinCommandHandler's own "Multi-instance safety" doc comment section). Leave
    // this false whenever more than one PokieDevServer process might share the same durable stores (e.g.
    // several instances pointed at the same FileSessionRepository directory for horizontal scaling).
    singleInstanceDeployment?: boolean;
    // Additive, opt-in-only, defaults to true (preserving every prior release's own behavior): whether a
    // session's serializer-provided debug payload (getInitialDebugData()/getRoundDebugData() — RNG
    // seeds, reel stops, evaluator traces, whatever a game author chose to expose for local debugging)
    // is captured into the *persisted* PokieSessionState at all, via captureInitialPokieSessionState/
    // captureRoundPokieSessionState. This is deliberately a separate knob from the `?debug=1` request
    // parameter (see the class doc comment's "Public/internal response split"): that parameter only ever
    // gates what one response transmits, but sessionRepository persists whatever was captured regardless
    // of whether any request ever asks for it — a durable SessionRepository (FileSessionRepository, or a
    // caller-provided one) would otherwise always accumulate debug-only content on disk with no way to
    // opt out. Set this to false for a production deployment that wants `?debug=1` fully unavailable
    // (never captured, so never anything to return) rather than merely untransmitted by default. Studio's
    // own local runtime (see StudioRuntimeManager) leaves this tied to its own debug toggle, which
    // defaults to true — a dev tool should default to full inspection, not the conservative production
    // posture this option otherwise preserves.
    captureDebugSessionData?: boolean;
    // Additive, opt-in-only, defaults to "partial" (preserving every prior release's own persisted-state
    // shape exactly): the versioned SessionCapturePolicy (see SessionCapturePolicy.ts) every played
    // round is captured under, via captureRoundPokieSessionState. "full" additionally builds and
    // persists a complete RoundArtifact off the runtime-produced session/win-evaluation state (see
    // buildRoundArtifactFromSession) as `roundArtifact` on the persisted PokieSessionState — screen,
    // wins/positions, steps/feature events, provenance, and a debug summary (command, credits,
    // before/after state, plus the serializer's own debug payload when captureDebugSessionData is also
    // true). Studio's own local runtime (see StudioRuntimeManager) always requests "full", independent of
    // its own debug toggle — a dev tool should default to a fully inspectable recorded round, not the
    // conservative "partial" posture this option otherwise preserves for production. A session whose
    // played type doesn't have the shape buildRoundArtifactFromSession requires still captures
    // everything else normally; it just gets `roundArtifactUnavailableReason` instead of a fabricated
    // `roundArtifact` — see PokieSessionState's own doc comment.
    sessionCapturePolicyMode?: SessionCaptureMode;
    // Only ever read when sessionCapturePolicyMode is "full", to stamp a built RoundArtifact's own
    // provenance.pokieVersion (see RoundArtifactProvenance). Defaults to "unknown" — the same fallback
    // StudioReplayExecutionService already uses when it isn't given a real one either.
    pokieVersion?: string;
    // Additive, opt-in-only pre-generated round support (see PokieDevServer's own doc comment,
    // "Pre-generated rounds"): when given, `POST /pregenerated-sessions` and
    // `POST /pregenerated-sessions/:id/spin` become active, drawing rounds from this fixed,
    // already-built library instead of running the loaded game's own calculation path. Absent (the
    // default), those routes 404 exactly like any other unknown route — zero behavior change to the
    // existing `/sessions` routes either way.
    preGeneratedOutcomeLibrary?: WeightedOutcomeLibrary;
    preGeneratedSessionRepository?: PreGeneratedSessionRepository;
    preGeneratedIdempotencyRepository?: IdempotencyRepository<PreGeneratedSpinCommandResult>;
};
