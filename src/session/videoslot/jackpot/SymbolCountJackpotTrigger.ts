import {SymbolsCombinationsAnalyzer} from "../combinations/SymbolsCombinationsAnalyzer.js";
import type {JackpotTriggerContext} from "./JackpotTriggerContext.js";
import type {JackpotTriggering} from "./JackpotTriggering.js";

// A deterministic, fully unit-testable jackpot trigger: the round wins a jackpot iff at least
// "minimumCount" occurrences of "symbolId" land on the played grid (e.g. 5+ dedicated jackpot symbols).
// Reuses SymbolsCombinationsAnalyzer.getScatterSymbolsPositions, the same position-counting primitive
// HoldAndWinCollecting's own default implementation is built on. A probability-based ("mystery") trigger, or
// one that also checks "context.stake"/"context.bet" for eligibility, is a different JackpotTriggering
// implementation entirely — this class only ever looks at the grid.
export class SymbolCountJackpotTrigger<T extends string | number | symbol = string> implements JackpotTriggering<T> {
    private readonly symbolId: T;
    private readonly minimumCount: number;

    constructor(symbolId: T, minimumCount: number) {
        if (!Number.isSafeInteger(minimumCount) || minimumCount <= 0) {
            throw new Error(`SymbolCountJackpotTrigger requires minimumCount to be a positive safe integer, got ${String(minimumCount)}.`);
        }
        this.symbolId = symbolId;
        this.minimumCount = minimumCount;
    }

    public isTriggered(context: JackpotTriggerContext<T>): boolean {
        return SymbolsCombinationsAnalyzer.getScatterSymbolsPositions<T>(context.symbols as T[][], this.symbolId).length >= this.minimumCount;
    }
}
