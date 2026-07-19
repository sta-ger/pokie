import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";

// The strategy for what "forced feature entry" (e.g. a bought bonus round) actually does to a
// session -- injected into VideoSlotWithBetModesSession rather than hard-coded there, so a new kind
// of forced entry (a jackpot pool, a different free-games shape, ...) is a new implementation of this
// interface, never a change to the bet-mode runtime itself. See FreeGamesForcedFeatureEntryHandler for
// the common "grant N free games" case, and NoOpForcedFeatureEntryHandler for the safe default.
export interface ForcedFeatureEntryHandling<T extends string | number | symbol = string> {
    forceFeatureEntry(session: VideoSlotSessionHandling<T>): void;
}
