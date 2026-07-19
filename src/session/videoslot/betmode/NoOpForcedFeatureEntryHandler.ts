import type {ForcedFeatureEntryHandling} from "./ForcedFeatureEntryHandling.js";
import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";

// The default ForcedFeatureEntryHandling: does nothing. Safe as VideoSlotWithBetModesSession's
// default constructor argument because its own default BetModesConfig never configures a mode with
// forcesFeatureEntry() true, so this is never actually exercised unless a caller opts into a forcing
// mode -- at which point they're expected to supply a real handler (e.g.
// FreeGamesForcedFeatureEntryHandler) too.
export class NoOpForcedFeatureEntryHandler<T extends string | number | symbol = string>
implements ForcedFeatureEntryHandling<T> {
    public forceFeatureEntry(_session: VideoSlotSessionHandling<T>): void {
        // Intentionally empty.
    }
}
