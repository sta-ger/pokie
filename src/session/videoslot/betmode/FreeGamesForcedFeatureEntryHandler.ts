import type {FreeGamesStateDetermining} from "../../FreeGamesStateDetermining.js";
import type {FreeGamesStateSetting} from "../../FreeGamesStateSetting.js";
import type {ForcedFeatureEntryHandling} from "./ForcedFeatureEntryHandling.js";
import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";

// The common "buy the feature" forced entry: grants freeGamesToGrant free games immediately, the same
// way FreeGamesRoundHandler.afterRoundPlayed grants a natural scatter-triggered win (extends
// getFreeGamesSum() rather than replacing it, so buying into an already-running round -- if a caller
// ever allows that -- extends it instead of clobbering the count). Feature-detected against the
// wrapped session (typically a VideoSlotWithFreeGamesSession further down the decorator chain):
// canForceFeatureEntry() reports false for a session that doesn't support
// FreeGamesStateSetting/FreeGamesStateDetermining, so wiring a buy-bonus mode onto a game without a
// free-games mechanic fails explicitly at play() time (ForcedFeatureEntryUnsupportedError) rather than
// silently charging the buy cost for an entry that never happens.
//
// Deliberately mode-agnostic: always grants the same fixed freeGamesToGrant no matter which mode's
// forcesFeatureEntry() triggered it -- declared with fewer parameters than ForcedFeatureEntryHandling
// itself (no `mode`), which is still a valid implementation of it (see that interface's own doc
// comment). A game with several differently-priced buy-feature modes (different costs/grants) composes
// multiple instances of this class behind PerModeForcedFeatureEntryHandler instead of teaching this one
// about mode ids itself.
export class FreeGamesForcedFeatureEntryHandler<T extends string | number | symbol = string>
implements ForcedFeatureEntryHandling<T> {
    private readonly freeGamesToGrant: number;

    constructor(freeGamesToGrant: number) {
        if (!Number.isInteger(freeGamesToGrant) || freeGamesToGrant <= 0) {
            throw new Error(`freeGamesToGrant must be a positive integer, got ${freeGamesToGrant}.`);
        }
        this.freeGamesToGrant = freeGamesToGrant;
    }

    public canForceFeatureEntry(session: VideoSlotSessionHandling<T>): boolean {
        return this.supportsFreeGamesState(session);
    }

    public forceFeatureEntry(session: VideoSlotSessionHandling<T>): void {
        // VideoSlotWithBetModesSession always checks canForceFeatureEntry() first -- this guard is
        // defense in depth for a handler called directly, not the primary safeguard.
        if (!this.supportsFreeGamesState(session)) {
            return;
        }
        session.setFreeGamesSum(session.getFreeGamesSum() + this.freeGamesToGrant);
    }

    private supportsFreeGamesState(
        session: VideoSlotSessionHandling<T>,
    ): session is VideoSlotSessionHandling<T> & FreeGamesStateSetting & FreeGamesStateDetermining {
        const candidate = session as Partial<FreeGamesStateSetting & FreeGamesStateDetermining>;
        return typeof candidate.setFreeGamesSum === "function" && typeof candidate.getFreeGamesSum === "function";
    }
}
