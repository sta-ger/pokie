import type {HoldAndWinTriggering} from "./HoldAndWinTriggering.js";
import type {LockedHoldAndWinSymbol} from "./LockedHoldAndWinSymbol.js";

// The common real-world rule: a base spin triggers Hold & Win iff at least "minimumCount" collectible
// symbols land on it in a single spin (e.g. 6+ coin symbols on the initial reel set). Swap in a different
// HoldAndWinTriggering implementation for anything more elaborate (a scatter-symbol-driven trigger
// independent of the collectible symbols themselves, a fixed random-chance trigger, ...) without touching
// HoldAndWinRoundHandler.
export class MinimumCountHoldAndWinTrigger<T extends string | number | symbol = string> implements HoldAndWinTriggering<T> {
    private readonly minimumCount: number;

    constructor(minimumCount: number) {
        this.minimumCount = minimumCount;
    }

    public isTriggered(candidates: readonly LockedHoldAndWinSymbol<T>[]): boolean {
        return candidates.length >= this.minimumCount;
    }
}
