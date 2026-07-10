// Optional, feature-detected capability (same pattern as ConvertableToSessionState): a
// GameSessionHandling implementation MAY implement this to declare the actual stake its next
// play() will charge — e.g. 0 while an in-progress free-games round is still unfinished (see
// VideoSlotWithFreeGamesSession), even though getBet() still reports the game's normal bet amount.
//
// SpinCommandHandler asks for this, when available, instead of ever inferring "this must be a free
// round" from the wallet balance being lower than getBet() on its own — a session's own
// canPlayNextGame() can legitimately return true at any balance for reasons that have nothing to do
// with free rounds, so balance alone is not a safe signal. A session that doesn't implement this
// interface is simply assumed to always charge its full getBet().
export interface StakeAmountDetermining {
    getStakeAmount(): number;
}
