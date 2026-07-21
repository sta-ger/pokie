import type {JackpotTriggerContext} from "./JackpotTriggerContext.js";
import type {JackpotTriggering} from "./JackpotTriggering.js";

// The safe, inert default JackpotTriggering — never triggers, regardless of context. Mirrors
// NoOpForcedFeatureEntryHandler's own role: with VideoSlotWithJackpotSession's constructor defaults left
// alone (this trigger plus an empty pools list), the decorator behaves exactly like the wrapped session on
// its own. A real deployment must explicitly configure a genuine JackpotTriggering (e.g.
// SymbolCountJackpotTrigger, or a custom probability-based one) to ever actually award anything.
export class NoJackpotTrigger<T extends string | number | symbol = string> implements JackpotTriggering<T> {
    public isTriggered(_context: JackpotTriggerContext<T>): boolean {
        return false;
    }
}
