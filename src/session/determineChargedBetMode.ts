import type {GameSessionHandling} from "./GameSessionHandling.js";
import {supportsBetModeSelecting} from "./videoslot/betmode/supportsBetModeSelecting.js";

/** Read before play. Consumed purchase attribution survives a zero-stake continuation. */
export function determineChargedBetMode(session: GameSessionHandling, stake: number): string | undefined {
    if (stake === 0) {
        const charged = (session as {getChargedBetModeId?: () => string | undefined}).getChargedBetModeId?.();
        if (charged !== undefined) return charged;
    }
    return supportsBetModeSelecting(session) ? session.getBetModeId() : undefined;
}
