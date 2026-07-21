import type {JackpotPoolStatisticsSnapshot} from "../../JackpotStatisticsSnapshot.js";

// Deterministic serialization/replay shape for VideoSlotWithJackpotSession. "poolStatistics" is the
// cumulative per-pool contribution/award-count/total-awarded map (see JackpotStateDetermining's own doc
// comment on it being the single source of truth) — real, durable session state, unlike the transient "last
// round outcome" (deliberately not part of this type at all, same reasoning as
// VideoSlotWithHoldAndWinSessionState). "pools", when present, maps each configured pool's own getId() to
// whatever *that* pool's own toSessionState() captured — only for pools that actually implement
// ConvertableToSessionState (see JackpotPoolRepresenting's own doc comment); a FixedJackpotPool (nothing to
// capture) or a deliberately-not-serialized shared/progressive pool simply never appears here. Absent
// entirely when none of the configured pools support capture at all. "base" nests whatever the wrapped
// session's own toSessionState() produced, the same "base?: unknown" convention
// VideoSlotWithBetModesSession/VideoSlotWithHoldAndWinSession already use, so this decorator composes
// correctly regardless of what it wraps or what wraps it.
export type VideoSlotWithJackpotSessionState = {
    poolStatistics: Readonly<Record<string, JackpotPoolStatisticsSnapshot>>;
    pools?: Record<string, unknown>;
    base?: unknown;
};
