import type {LockedHoldAndWinSymbol} from "./LockedHoldAndWinSymbol.js";

// Deterministic serialization/replay shape for VideoSlotWithHoldAndWinSession — every field needed to
// resume a feature run exactly where it left off, including every locked symbol's own already-resolved
// effect (never recomputed from live configuration on restore, see LockedHoldAndWinSymbol's own doc
// comment). "base" nests whatever the wrapped session's own toSessionState() produced, if it implements
// ConvertableToSessionState — the same opaque-nesting convention BetModeSessionState already established,
// so this decorator composes correctly whether it wraps a plain VideoSlotSession, a
// VideoSlotWithFreeGamesSession, a VideoSlotWithBetModesSession, or a stack of several.
export type VideoSlotWithHoldAndWinSessionState<T extends string | number | symbol = string> = {
    active: boolean;
    lockedSymbols: readonly LockedHoldAndWinSymbol<T>[];
    respinsRemaining: number;
    payout: number;
    base?: unknown;
};
