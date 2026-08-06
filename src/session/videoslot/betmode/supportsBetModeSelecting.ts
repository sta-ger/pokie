import type {BetModeSelecting} from "./BetModeSelecting.js";

// Feature-detected the same way determineStakeAmount.ts checks StakeAmountDetermining: bet-mode
// selection is an opt-in decorator (VideoSlotWithBetModesSession), not part of every session's own
// interface, so a caller (SpinCommandHandler, VideoSlotSessionSerializer) checks for it rather than
// assuming it. All three members are checked, not just one, since a partial match would only ever
// come from a stub/mock, never a real implementation.
export function supportsBetModeSelecting<T>(session: T): session is T & BetModeSelecting {
    const candidate = session as Partial<BetModeSelecting>;
    return (
        typeof candidate.getBetModeId === "function" &&
        typeof candidate.setBetMode === "function" &&
        typeof candidate.getAvailableBetModeIds === "function"
    );
}
