import type {RoundArtifactJson} from "../artifact/RoundArtifactJson.js";

export type ReplayDescriptor = {
    // The identity of the actual game session this replay created and played forward -- minted fresh
    // each run, independent of any job/request id a caller (e.g. Studio's StudioReplayExecutionService)
    // tracks the run itself under. Two runs of the same seed/round produce two different sessionIds,
    // since each is a brand-new session, never a lookup of a prior one.
    sessionId: string;
    game: {id: string; name: string; version: string};
    seed: string | null;
    round: number;
    totalBet: number;
    totalWin: number;
    // The player-facing balance after the target round.  Studio replays lift a session's balance to
    // avoid bankroll exhaustion while seeking a later round, so this optional ledger value preserves
    // the original session's observable balance without changing replay execution semantics.
    credits?: number;
    screen: unknown[][] | null;
    timestamp: number;
    durationMs: number;
    // The full per-round record (steps, wins with payout/multiplier breakdown, feature events,
    // provenance, content hash) for the target round -- optional so every existing caller/producer of a
    // ReplayDescriptor that predates this field (e.g. ReplayRecorder/`pokie replay`, which never builds
    // one) stays valid. Only Studio's own StudioReplayExecutionService populates it.
    artifact?: RoundArtifactJson;
    // Serialized session state immediately before / after the target round's play() -- via the same
    // session-serialization mechanism PokieDevServer's own internal/debug response already uses
    // (captureInitialPokieSessionState/captureRoundPokieSessionState), reused as-is, never recomputed.
    // Public fields only (context/bet/win/screen/featureState/initialPayload/roundPayload) -- the
    // serializer's own initialDebugPayload/roundDebugPayload never appear here, only inside the
    // artifact's own `debug` bag. Absent when the game/session doesn't support state serialization or
    // capture fails -- never treated as a replay failure. Additive/optional, same precedent as
    // `artifact` above: only Studio's own StudioReplayExecutionService populates these.
    stateBefore?: Record<string, unknown>;
    stateAfter?: Record<string, unknown>;
};
