import type {BetModeDescribing} from "./BetModeDescribing.js";
import type {ForcedFeatureEntryHandling} from "./ForcedFeatureEntryHandling.js";
import type {ModeAwareForcedFeatureEntryHandling} from "./ModeAwareForcedFeatureEntryHandling.js";
import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";

// Routes forced entry to a different ForcedFeatureEntryHandling per bet mode id -- what lets several
// differently-priced/differently-granting buyFeature modes (e.g. "buy-10" costing 50x for 10 free
// games, "buy-20" costing 100x for 20) coexist on one session without VideoSlotWithBetModesSession (or
// any other core class) ever hard-coding a specific mode id: this class is the one and only place a
// mode id is matched against anything, and it's entirely caller-supplied/composed, never built in.
//
// A mode id with no entry in handlersByModeId is simply unsupported (canForceFeatureEntryForMode()
// false) -- the same "fail explicitly, never silently charge for an entry that didn't happen" contract
// VideoSlotWithBetModesSession.play() already enforces for every ForcedFeatureEntryHandling (see
// ForcedFeatureEntryUnsupportedError), not a special case introduced here.
//
// Implements ModeAwareForcedFeatureEntryHandling (see that interface's own doc comment) rather than
// requiring a `mode` parameter on the plain ForcedFeatureEntryHandling methods -- the ...ForMode()
// methods below are what VideoSlotWithBetModesSession.play() actually calls (it feature-detects this
// interface); the plain canForceFeatureEntry()/forceFeatureEntry() are only here to satisfy
// ForcedFeatureEntryHandling itself so an instance of this class remains assignable wherever that
// (narrower, public) type is expected, and are never actually invoked in practice.
export class PerModeForcedFeatureEntryHandler<T extends string | number | symbol = string>
implements ModeAwareForcedFeatureEntryHandling<T> {
    private readonly handlersByModeId: ReadonlyMap<string, ForcedFeatureEntryHandling<T>>;

    constructor(handlersByModeId: ReadonlyMap<string, ForcedFeatureEntryHandling<T>>) {
        this.handlersByModeId = handlersByModeId;
    }

    public canForceFeatureEntryForMode(session: VideoSlotSessionHandling<T>, mode: BetModeDescribing): boolean {
        const handler = this.handlersByModeId.get(mode.getId());
        return handler !== undefined && handler.canForceFeatureEntry(session);
    }

    public forceFeatureEntryForMode(session: VideoSlotSessionHandling<T>, mode: BetModeDescribing): void {
        // VideoSlotWithBetModesSession always checks canForceFeatureEntryForMode() first -- this guard
        // (a missing entry simply doing nothing) is defense in depth for a handler called directly, not
        // the primary safeguard.
        this.handlersByModeId.get(mode.getId())?.forceFeatureEntry(session);
    }

    // Never actually called by VideoSlotWithBetModesSession (it prefers the ...ForMode() methods above
    // whenever they're present, which they always are on this class) -- present only so this class
    // satisfies the plain ForcedFeatureEntryHandling contract. Always reports "can't force anything"
    // rather than guessing which mode might apply, since there is no mode to route by here.
    public canForceFeatureEntry(_session: VideoSlotSessionHandling<T>): boolean {
        return false;
    }

    public forceFeatureEntry(_session: VideoSlotSessionHandling<T>): void {
        // Intentionally empty -- see canForceFeatureEntry() above.
    }
}
