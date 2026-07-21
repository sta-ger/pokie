import type {JackpotPoolStatisticsSnapshot} from "../../JackpotStatisticsSnapshot.js";

// Deterministic serialization/replay shape for VideoSlotWithJackpotSession. "poolStatistics" is the
// cumulative per-pool contribution/award-count/total-awarded map (see JackpotStateDetermining's own doc
// comment on it being the single source of truth) — real, durable session state, unlike the transient "last
// round outcome" (deliberately not part of this type at all, same reasoning as
// VideoSlotWithHoldAndWinSessionState). Optional here, not because a freshly-captured state ever omits it
// (toSessionState() always sets it), but so this type can also describe state captured by the *previous*
// shape of this decorator, before poolStatistics existed — see "awardCount"/"totalAwarded" below.
// "pools", when present, maps each configured pool's own getId() to whatever *that* pool's own
// toSessionState() captured — only for pools that actually implement ConvertableToSessionState (see
// JackpotPoolRepresenting's own doc comment); a FixedJackpotPool (nothing to capture) or a
// deliberately-not-serialized shared/progressive pool simply never appears here. Absent entirely when none
// of the configured pools support capture at all. "base" nests whatever the wrapped session's own
// toSessionState() produced, the same "base?: unknown" convention
// VideoSlotWithBetModesSession/VideoSlotWithHoldAndWinSession already use, so this decorator composes
// correctly regardless of what it wraps or what wraps it.
//
// "awardCount"/"totalAwarded": deprecated, additive-only remnants of this type's previous flat shape (before
// per-pool poolStatistics existed). Kept here purely for source compatibility with any already-serialized
// state a deployer might still have lying around — VideoSlotWithJackpotSession.toSessionState() never emits
// them (poolStatistics is the only shape it ever produces), and fromSessionState() only ever consults them
// when poolStatistics itself is absent (see its own doc comment on the exact migration rule). Never read or
// written as an independently authoritative representation alongside poolStatistics.
export type VideoSlotWithJackpotSessionState = {
    poolStatistics?: Readonly<Record<string, JackpotPoolStatisticsSnapshot>>;
    /** @deprecated Legacy pre-poolStatistics shape; see this type's own doc comment. */
    awardCount?: number;
    /** @deprecated Legacy pre-poolStatistics shape; see this type's own doc comment. */
    totalAwarded?: number;
    pools?: Record<string, unknown>;
    base?: unknown;
};
