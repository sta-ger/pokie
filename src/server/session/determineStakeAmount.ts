import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import type {StakeAmountDetermining} from "../../session/StakeAmountDetermining.js";

// Feature-detected: a session implementing StakeAmountDetermining (e.g.
// VideoSlotWithFreeGamesSession) is asked what its next play() will actually charge — 0 during an
// in-progress free-games round, for instance. A session that doesn't implement it is assumed to
// always charge its full nominal bet; the wallet balance is never used to infer "this must be
// free" on its own (a session's canPlayNextGame() can legitimately allow a spin at any balance for
// reasons unrelated to a free round, so balance alone isn't a safe signal).
export function determineStakeAmount(session: GameSessionHandling, nominalBet: number): number {
    if (!supportsStakeAmountDetermining(session)) {
        return nominalBet;
    }
    return session.getStakeAmount();
}

function supportsStakeAmountDetermining(
    session: GameSessionHandling,
): session is GameSessionHandling & StakeAmountDetermining {
    return typeof (session as Partial<StakeAmountDetermining>).getStakeAmount === "function";
}
