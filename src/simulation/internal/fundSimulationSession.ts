import type {GameSessionHandling} from "../../session/GameSessionHandling.js";

/** The one simulation bankroll policy: RTP/volatility measurement must not stop at a demo wallet balance. */
export function fundSimulationSession(session: GameSessionHandling): void {
    const setCreditsAmount = (session as Partial<GameSessionHandling>).setCreditsAmount;
    if (typeof setCreditsAmount === "function") Reflect.apply(setCreditsAmount, session, [Number.MAX_SAFE_INTEGER]);
}
