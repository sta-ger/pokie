import type {JackpotAwarding} from "./JackpotAwarding.js";
import type {JackpotAwardResult} from "./JackpotAwardResult.js";
import type {JackpotPoolRepresenting} from "./JackpotPoolRepresenting.js";
import type {JackpotTriggerContext} from "./JackpotTriggerContext.js";

// The default JackpotAwarding: always awards the first configured pool — trivially correct for the common
// single-tier deployment (exactly one pool configured), and a reasonable, fully deterministic default even
// for a multi-tier one (awards whichever pool was listed first). A deployment that wants real multi-tier
// selection (weighted random among tiers, a "always award the largest currently-eligible pool" rule, ...)
// supplies its own JackpotAwarding instead. "symbolId" is optional and defaults to undefined (see
// JackpotAwardResult's own doc comment on what that means for the reported win breakdown) — this is what
// lets this class be constructed with zero arguments for any symbol type T, unlike a hypothetical
// implementation that required one.
export class SingleTierJackpotAwarding<T extends string | number | symbol = string> implements JackpotAwarding<T> {
    private readonly symbolId: T | undefined;

    constructor(symbolId?: T) {
        this.symbolId = symbolId;
    }

    public resolveAward(pools: readonly JackpotPoolRepresenting[], _context: JackpotTriggerContext<T>): JackpotAwardResult<T> {
        const pool = pools[0];
        return {poolId: pool.getId(), amount: pool.award(), symbolId: this.symbolId};
    }
}
