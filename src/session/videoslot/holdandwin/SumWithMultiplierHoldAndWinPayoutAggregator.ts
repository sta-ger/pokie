import type {HoldAndWinPayoutAggregating} from "./HoldAndWinPayoutAggregating.js";
import type {LockedHoldAndWinSymbol} from "./LockedHoldAndWinSymbol.js";

// The common real-world Hold & Win payout rule: sum every locked "value" symbol's own amount, then
// multiply that sum by the product of every locked "multiplier" symbol's own factor (an empty/absent
// multiplier set leaves the sum unscaled — multiplying by 1, not 0). "amountsAreBetMultiples" mirrors
// ValueWinCalculator's own convention (positions.length * valuePerSymbol * bet) — set it true to interpret
// each "value" amount as a multiple of the triggering bet rather than a flat credit amount; defaults to
// false (flat credits), the simpler and more common real-world convention for a coin-value symbol's own
// displayed amount.
export class SumWithMultiplierHoldAndWinPayoutAggregator<T extends string | number | symbol = string> implements HoldAndWinPayoutAggregating<T> {
    private readonly amountsAreBetMultiples: boolean;

    constructor(amountsAreBetMultiples = false) {
        this.amountsAreBetMultiples = amountsAreBetMultiples;
    }

    public aggregate(lockedSymbols: readonly LockedHoldAndWinSymbol<T>[], bet: number): number {
        let sum = 0;
        let multiplier = 1;
        for (const locked of lockedSymbols) {
            if (locked.effect.kind === "value") {
                sum += this.amountsAreBetMultiples ? locked.effect.amount * bet : locked.effect.amount;
            } else {
                multiplier *= locked.effect.factor;
            }
        }
        return sum * multiplier;
    }
}
