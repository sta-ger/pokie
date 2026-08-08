// Versioned contract for what a captured round's PokieSessionState actually contains beyond the
// always-present bet/win/screen/featureState/payloads (see PokieSessionState, captureBaseSessionState).
// Bump SESSION_CAPTURE_POLICY_VERSION whenever a new mode/field is introduced — same convention as
// ROUND_ARTIFACT_SCHEMA_VERSION — so a reader (e.g. a durable SessionRepository like
// FileSessionRepository) can tell an older persisted state (no `capturePolicy` at all — see
// PokieSessionState's own doc comment) apart from one captured under a newer policy version, rather
// than guessing from field presence alone.
export const SESSION_CAPTURE_POLICY_VERSION = 1;

export type SessionCaptureMode =
    // Studio/dev's own posture (see PokieDevServerOptions.sessionCapturePolicyMode): every played round also builds and persists
    // a complete RoundArtifact (see buildRoundArtifactFromSession) straight off the runtime-produced
    // session/win-evaluation state — screen, wins/positions, steps/feature events, provenance, and a
    // debug summary (command, credits, before/after state, and, when captureDebugPayloads is also true,
    // the serializer's own debug-only payload) — available for inspection without re-deriving any of it.
    // Independent of `captureDebugPayloads` below: a deployment can request "full" round-artifact
    // capture without ever persisting serializer-internal RNG/evaluator traces, or vice versa.
    | "full"
    // Production's own default (see PokieDevServerOptions.sessionCapturePolicyMode): the legacy partial
    // capture this package has always persisted — bet/win/screen/featureState plus whatever a game's
    // own serializer contributes via initialPayload/roundPayload — no RoundArtifact built or stored. A
    // deployment that wants full capture in production opts in explicitly.
    | "partial";

export type SessionCapturePolicy = {
    readonly version: number;
    readonly mode: SessionCaptureMode;
    // See captureDebugSessionData's pre-existing doc comment on PokieDevServerOptions — kept as its own
    // flag rather than folded into `mode` (see the "full" case above for why the two are orthogonal).
    readonly captureDebugPayloads: boolean;
};

export function buildSessionCapturePolicy(mode: SessionCaptureMode, captureDebugPayloads: boolean): SessionCapturePolicy {
    return {version: SESSION_CAPTURE_POLICY_VERSION, mode, captureDebugPayloads};
}
