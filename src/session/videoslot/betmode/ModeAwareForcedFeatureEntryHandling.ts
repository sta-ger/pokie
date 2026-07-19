import type {BetModeDescribing} from "./BetModeDescribing.js";
import type {ForcedFeatureEntryHandling} from "./ForcedFeatureEntryHandling.js";
import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";

// Additive, backward-compatible extension of ForcedFeatureEntryHandling for a handler that needs to
// know WHICH bet mode triggered forced entry -- e.g. to route several differently-priced/differently-
// granting buyFeature modes to different handling (see PerModeForcedFeatureEntryHandler) without
// teaching VideoSlotWithBetModesSession, or the plain ForcedFeatureEntryHandling contract itself,
// about any specific mode id.
//
// Deliberately a SEPARATE interface rather than adding a `mode` parameter to
// ForcedFeatureEntryHandling's own methods: doing that would require every existing implementation,
// and every existing caller holding a ForcedFeatureEntryHandling-typed value, to supply a mode argument
// -- breaking external code that implements or calls canForceFeatureEntry(session)/
// forceFeatureEntry(session) with a single argument. VideoSlotWithBetModesSession.play() feature-
// detects this interface (does the handler implement canForceFeatureEntryForMode?) and prefers it when
// present, falling back to the plain single-argument ForcedFeatureEntryHandling methods otherwise --
// the same feature-detection pattern used throughout this codebase for other optional capabilities
// (StakeAmountDetermining, ConvertableToSessionState, ...).
export interface ModeAwareForcedFeatureEntryHandling<T extends string | number | symbol = string>
    extends ForcedFeatureEntryHandling<T> {
    canForceFeatureEntryForMode(session: VideoSlotSessionHandling<T>, mode: BetModeDescribing): boolean;

    forceFeatureEntryForMode(session: VideoSlotSessionHandling<T>, mode: BetModeDescribing): void;
}
