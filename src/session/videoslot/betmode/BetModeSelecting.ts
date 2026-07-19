// Session capability for switching the active bet mode -- see VideoSlotWithBetModesSession.
// setBetMode() throws UnknownBetModeError for an id not in the configured BetModesConfigRepresenting,
// rather than silently falling back to a default: an unnoticed fallback here would mean a spin gets
// charged/played under the wrong mode, which a caller handling real money should never have silently
// happen.
export interface BetModeSelecting {
    getBetModeId(): string;

    setBetMode(modeId: string): void;
}
