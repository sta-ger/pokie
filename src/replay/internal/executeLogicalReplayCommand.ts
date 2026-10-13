import type {GameSessionHandling} from "../../session/GameSessionHandling.js";
import {determineStakeAmount} from "../../session/determineStakeAmount.js";
import type {SessionCommand} from "../../runtime/SessionCommand.js";
import {SessionRuntime} from "../../runtime/SessionRuntime.js";

/** Fund each replay entry at its actual stake scale so credit differences retain fractional awards.
 * Preparation owns selection/rollback; no play or RNG draw happens while determining the stake.
 * Continuations keep that bankroll and the domain's deferred bank until the logical boundary.
 */
export function executeLogicalReplayCommand(session: GameSessionHandling, command: SessionCommand, signal?: AbortSignal) {
    const runtime = new SessionRuntime(session);
    const prepared = runtime.prepare(command, Number.MAX_SAFE_INTEGER);
    if (prepared.status !== "ready") throw new Error(`blocked: ${prepared.reason}`);
    let balance: number;
    let restored = false;
    try {
        balance = Math.max(session.getBet(), determineStakeAmount(session, session.getBet()));
        if (!Number.isFinite(balance) || balance <= 0) throw new Error("Replay entry requires a finite positive bankroll.");
    } finally {
        restored = prepared.rollback();
    }
    if (!restored) throw new Error("Replay selection could not be restored.");
    session.setCreditsAmount(balance);
    const result = runtime.execute(command, signal);
    if (result.status !== "played") throw new Error(`${result.status}: ${result.reason}`);
    return result;
}
