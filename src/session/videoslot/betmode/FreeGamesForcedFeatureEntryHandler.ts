import type {FreeGamesStateDetermining} from "../../FreeGamesStateDetermining.js";
import type {FreeGamesStateSetting} from "../../FreeGamesStateSetting.js";
import type {ForcedFeatureEntryHandling} from "./ForcedFeatureEntryHandling.js";
import type {VideoSlotSessionHandling} from "../VideoSlotSessionHandling.js";

// The common "buy the feature" forced entry: grants freeGamesToGrant free games immediately, the same
// way FreeGamesRoundHandler.afterRoundPlayed grants a natural scatter-triggered win (extends
// getFreeGamesSum() rather than replacing it, so buying into an already-running round -- if a caller
// ever allows that -- extends it instead of clobbering the count). Feature-detected against the
// wrapped session (typically a VideoSlotWithFreeGamesSession further down the decorator chain): a
// session that doesn't support FreeGamesStateSetting/FreeGamesStateDetermining is left untouched, so
// wiring a buy-bonus mode onto a game without a free-games mechanic never crashes -- it just doesn't
// grant anything beyond the stake charge.
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
