import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import type {PayoutAmountDetermining} from "../../session/PayoutAmountDetermining.js";

/** Prefer domain money over subtraction of large credit balances. Legacy custom
 * sessions retain their balance-delta settlement, including negative adjustments. */
export function resolveSessionPayout(session: GameSessionHandling, creditsBefore: number, stake: number): number {
    const exact = (session as Partial<PayoutAmountDetermining>).getPayoutAmount?.();
    if (exact !== undefined && !Number.isFinite(exact)) throw new Error("Domain payout must be finite.");
    return exact ?? session.getCreditsAmount() - creditsBefore + stake;
}
