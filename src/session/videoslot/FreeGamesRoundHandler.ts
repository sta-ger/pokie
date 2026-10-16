import type {FreeGamesRoundHandling} from "./FreeGamesRoundHandling.js";
import type {VideoSlotWithFreeGamesSessionHandling} from "./VideoSlotWithFreeGamesSessionHandling.js";

/** Built-in bookkeeping, shared by execution and canonical checkpoint validation. */
export function resolveFreeGamesEntry(num: number, sum: number, bank: number, forcedGrant = 0) {
    return num === sum ? {num: 0, sum: forcedGrant, bank: 0} : {num, sum: sum + forcedGrant, bank};
}

export function resolveFreeGamesRound(num: number, sum: number, bank: number, win: number, grant: number) {
    const banked = sum > 0 && num < sum;
    if (banked) {
        num++;
        bank += win;
    }
    if (grant > 0) sum += grant;
    const released = grant <= 0 && sum > 0 && num === sum;
    if (!Number.isFinite(bank)) throw new Error("Free-games bank or balance overflow.");
    return {num, sum, bank, banked, released, payout: (banked ? 0 : win) + (released ? bank : 0)};
}

export class FreeGamesRoundHandler<T extends string | number | symbol = string> implements FreeGamesRoundHandling<T> {
    public beforeRoundPlayed(session: VideoSlotWithFreeGamesSessionHandling<T>): void {
        if (session.getFreeGamesNum() === session.getFreeGamesSum()) {
            const next = resolveFreeGamesEntry(session.getFreeGamesNum(), session.getFreeGamesSum(), session.getFreeGamesBank());
            session.setFreeGamesBank(next.bank);
            session.setFreeGamesNum(next.num);
            session.setFreeGamesSum(next.sum);
        }
    }

    public afterRoundPlayed(session: VideoSlotWithFreeGamesSessionHandling<T>, creditsBeforePlay: number): void {
        const next = resolveFreeGamesRound(session.getFreeGamesNum(), session.getFreeGamesSum(), session.getFreeGamesBank(),
            session.getWinAmount(), session.getWonFreeGamesNumber());
        let credits = next.banked ? creditsBeforePlay : session.getCreditsAmount();
        if (next.released) credits += next.bank;
        if (!Number.isFinite(credits)) throw new Error("Free-games bank or balance overflow.");
        session.setFreeGamesNum(next.num);
        session.setFreeGamesBank(next.bank);
        session.setFreeGamesSum(next.sum);
        session.setCreditsAmount(credits);
    }
}
