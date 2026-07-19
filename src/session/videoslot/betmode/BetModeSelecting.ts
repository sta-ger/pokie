// Session capability for switching the active bet mode -- see VideoSlotWithBetModesSession.
// setBetMode() throws UnknownBetModeError for an id not in the configured BetModesConfigRepresenting,
// rather than silently falling back to a default: an unnoticed fallback here would mean a spin gets
// charged/played under the wrong mode, which a caller handling real money should never have silently
// happen. It also throws ForcingBetModeSelectionRejectedError for a forcing (forcesFeatureEntry())
// mode selected while a zero-stake feature round is already active, rather than silently latching the
// selection for a "deferred" purchase that would otherwise auto-fire, uncharged-for by the player at
// that moment, the instant the current round finishes.
//
// getBetModeId() only ever reflects a *persistent* selection (the default mode, or a caller's own
// explicit choice like ante) or a forcing mode's purchase not yet acted on by play() -- once a forcing
// mode's purchase succeeds, the session reverts to the default mode on its own, so getBetModeId()
// never keeps reporting a one-shot purchase as if it were still an active, ongoing choice.
export interface BetModeSelecting {
    getBetModeId(): string;

    setBetMode(modeId: string): void;
}
