import type {ForcedFeatureEntryHandling} from "./ForcedFeatureEntryHandling.js";
import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";

// The default ForcedFeatureEntryHandling: has no capability to force anything, and never claims
// otherwise. Safe as VideoSlotWithBetModesSession's default constructor argument because its own
// default BetModesConfig never configures a mode with forcesFeatureEntry() true, so
// canForceFeatureEntry() is never actually consulted unless a caller opts a mode into forcing entry --
// at which point they're expected to supply a real handler (e.g. FreeGamesForcedFeatureEntryHandler)
// too. Leaving this default handler wired to a forcing mode by mistake fails loudly at play() time
// (ForcedFeatureEntryUnsupportedError) rather than silently charging the buy/ante cost for an entry
// that never happens.
export class NoOpForcedFeatureEntryHandler<T extends string | number | symbol = string>
implements ForcedFeatureEntryHandling<T> {
    public canForceFeatureEntry(_session: VideoSlotSessionHandling<T>): boolean {
        return false;
    }

    public forceFeatureEntry(_session: VideoSlotSessionHandling<T>): void {
        // Intentionally empty -- see canForceFeatureEntry(), which is always false, so
        // VideoSlotWithBetModesSession never actually calls this.
    }
}
