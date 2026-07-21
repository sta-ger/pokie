import {WinComponent} from "../winevaluation/WinComponent.js";

// Represents a jackpot award's own contribution to a round's win breakdown when the award has no natural
// associated symbol (a "mystery"/pure-probability award, or any JackpotAwarding implementation that simply
// didn't supply a symbolId — see JackpotAwardResult's own doc comment). WinComponent<T>'s own constructor
// requires *some* symbolId; this mirrors LegacyWinComponent's own already-established pattern for "a win
// amount with no real symbol to attribute it to" (same cast through unknown, not a new risk introduced
// here) rather than fabricating a meaningless placeholder symbol or widening the shared WinComponent
// contract. This is what keeps getWinEvaluationResult()'s own getTotalWin() exactly equal to getWinAmount()
// even without a symbolId — see VideoSlotWithJackpotSession's own getWinEvaluationResult() override, which
// uses this class specifically for that case instead of silently omitting a component (and therefore
// silently dropping the jackpot amount from the reconstructed breakdown's own total).
export class JackpotWinComponent<T extends string | number | symbol = string> extends WinComponent<T> {
    constructor(poolId: string, winAmount: number) {
        super("jackpot", poolId, undefined as unknown as T, winAmount, [], [], {poolId});
    }
}
