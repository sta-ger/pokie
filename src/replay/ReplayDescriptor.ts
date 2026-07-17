import type {RoundArtifactJson} from "../artifact/RoundArtifactJson.js";

export type ReplayDescriptor = {
    game: {id: string; name: string; version: string};
    seed: string | null;
    round: number;
    totalBet: number;
    totalWin: number;
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
