// Session capability for switching the active bet mode -- see VideoSlotWithBetModesSession.
// setBetMode() throws UnknownBetModeError for an id not in the configured BetModesConfigRepresenting,
// rather than silently falling back to a default: an unnoticed fallback here would mean a spin gets
// charged/played under the wrong mode, which a caller handling real money should never have silently
// happen. It also throws ForcingBetModeSelectionRejectedError for a forcing (forcesFeatureEntry())
// mode selected while a zero-stake feature round is already active, rather than silently latching the
// selection for a "deferred" purchase that would otherwise auto-fire, uncharged-for by the player at
// that moment, the instant the current round finishes.
export interface BetModeSelecting {
    getBetModeId(): string;

    setBetMode(modeId: string): void;
}
