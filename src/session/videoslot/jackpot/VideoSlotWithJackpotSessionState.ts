// Deterministic serialization/replay shape for VideoSlotWithJackpotSession. "awardCount"/"totalAwarded" are
// the cumulative statistics counters (see JackpotStateDetermining's own doc comment) — real, durable session
// state, unlike the transient "last round outcome" (deliberately not part of this type at all, same
// reasoning as VideoSlotWithHoldAndWinSessionState). "pools", when present, maps each configured pool's own
// getId() to whatever *that* pool's own toSessionState() captured — only for pools that actually implement
// ConvertableToSessionState (see JackpotPoolRepresenting's own doc comment); a FixedJackpotPool (nothing to
// capture) or a deliberately-not-serialized shared/progressive pool simply never appears here. Absent
// entirely when none of the configured pools support capture at all. "base" nests whatever the wrapped
// session's own toSessionState() produced, the same "base?: unknown" convention
// VideoSlotWithBetModesSession/VideoSlotWithHoldAndWinSession already use, so this decorator composes
// correctly regardless of what it wraps or what wraps it.
export type VideoSlotWithJackpotSessionState = {
    awardCount: number;
    totalAwarded: number;
    pools?: Record<string, unknown>;
    base?: unknown;
};
