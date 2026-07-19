import type {BetModeDescribing} from "./BetModeDescribing.js";
import type {ForcedFeatureEntryHandling} from "./ForcedFeatureEntryHandling.js";
import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";

// Routes forced entry to a different ForcedFeatureEntryHandling per bet mode id -- what lets several
// differently-priced/differently-granting buyFeature modes (e.g. "buy-10" costing 50x for 10 free
// games, "buy-20" costing 100x for 20) coexist on one session without VideoSlotWithBetModesSession (or
// any other core class) ever hard-coding a specific mode id: this class is the one and only place a
// mode id is matched against anything, and it's entirely caller-supplied/composed, never built in.
//
// A mode id with no entry in handlersByModeId is simply unsupported (canForceFeatureEntry() false) --
// the same "fail explicitly, never silently charge for an entry that didn't happen" contract
// VideoSlotWithBetModesSession.play() already enforces for every ForcedFeatureEntryHandling (see
// ForcedFeatureEntryUnsupportedError), not a special case introduced here.
export class PerModeForcedFeatureEntryHandler<T extends string | number | symbol = string>
implements ForcedFeatureEntryHandling<T> {
    private readonly handlersByModeId: ReadonlyMap<string, ForcedFeatureEntryHandling<T>>;

    constructor(handlersByModeId: ReadonlyMap<string, ForcedFeatureEntryHandling<T>>) {
        this.handlersByModeId = handlersByModeId;
    }

    public canForceFeatureEntry(session: VideoSlotSessionHandling<T>, mode: BetModeDescribing): boolean {
        const handler = this.handlersByModeId.get(mode.getId());
        return handler !== undefined && handler.canForceFeatureEntry(session, mode);
    }

    public forceFeatureEntry(session: VideoSlotSessionHandling<T>, mode: BetModeDescribing): void {
        // VideoSlotWithBetModesSession always checks canForceFeatureEntry() first -- this guard (a
        // missing entry simply doing nothing) is defense in depth for a handler called directly, not
        // the primary safeguard.
        this.handlersByModeId.get(mode.getId())?.forceFeatureEntry(session, mode);
    }
}
