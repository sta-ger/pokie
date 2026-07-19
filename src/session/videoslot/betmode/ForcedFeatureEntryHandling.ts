import type {BetModeDescribing} from "./BetModeDescribing.js";
import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";

// The strategy for what "forced feature entry" (e.g. a bought bonus round) actually does to a
// session -- injected into VideoSlotWithBetModesSession rather than hard-coded there, so a new kind
// of forced entry (a jackpot pool, a different free-games shape, ...) is a new implementation of this
// interface, never a change to the bet-mode runtime itself. See FreeGamesForcedFeatureEntryHandler for
// the common "grant N free games" case, NoOpForcedFeatureEntryHandler for the safe default, and
// PerModeForcedFeatureEntryHandler for routing several different forcing modes (different
// costs/grants) to their own handler by mode id -- without VideoSlotWithBetModesSession itself ever
// knowing a mode id beyond the one currently selected.
//
// `mode` is the currently active BetModeDescribing whose forcesFeatureEntry() triggered this call --
// passed through so a mode-aware handler (see PerModeForcedFeatureEntryHandler) can route by
// mode.getId() without VideoSlotWithBetModesSession hard-coding any specific mode id itself. A handler
// indifferent to which mode triggered it (e.g. FreeGamesForcedFeatureEntryHandler, NoOpForcedFeatureEntryHandler)
// is free to ignore this parameter entirely -- adding it here is backward compatible with every
// existing implementation, since a function declared with fewer parameters than an interface requires
// remains a valid implementation of it.
export interface ForcedFeatureEntryHandling<T extends string | number | symbol = string> {
    // Checked by VideoSlotWithBetModesSession.play() *before* charging anything, for every mode with
    // forcesFeatureEntry() true -- a false here makes play() fail explicitly (see
    // ForcedFeatureEntryUnsupportedError) instead of silently charging the buy/ante cost for an entry
    // that never actually happened.
    canForceFeatureEntry(session: VideoSlotSessionHandling<T>, mode: BetModeDescribing): boolean;

    forceFeatureEntry(session: VideoSlotSessionHandling<T>, mode: BetModeDescribing): void;
}
