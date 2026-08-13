// A fixture used to demonstrate "pokie sim"'s feature-level breakdown for a category that ISN'T
// base/freeGames: this game's session implements the optional SimulationCategoryDetermining contract
// directly (getSimulationCategory()) instead of StakeAmountDetermining — every 7th round is an
// explicitly declared "bonus" round. There's no free-games mechanic here at all; "bonus" is just a
// label the session hands AggregateSimulationRunner for round r before r is played, same as a real
// game might label a pick-me bonus, a hold-and-win respin, or a jackpot round it doesn't want lumped
// into "base". A plain hand-rolled session (not VideoSlotSession) is used deliberately, to show the
// contract works for any GameSessionHandling, not just video slots.
module.exports = {
    getManifest() {
        return {id: "playable-game-with-bonus-round", name: "Playable Game With Bonus Round", version: "1.0.0"};
    },
    createSession() {
        let credits = 1000;
        const bet = 1;
        let round = 0; // index of the round ABOUT TO BE played (0-indexed)
        let pendingWin = 0;

        const isBonusRound = () => round % 7 === 6;

        return {
            getCreditsAmount: () => credits,
            setCreditsAmount(value) {
                credits = value;
            },
            getBet: () => bet,
            setBet() {
                // fixed bet for this fixture
            },
            getAvailableBets: () => [1],
            canPlayNextGame: () => credits >= bet,
            getSimulationCategory: () => (isBonusRound() ? "bonus" : "base"),
            play() {
                if (isBonusRound()) {
                    pendingWin = bet * 3;
                } else if (round % 3 === 0) {
                    pendingWin = bet;
                } else {
                    pendingWin = 0;
                }
                credits = credits - bet + pendingWin;
                round++;
            },
            getWinAmount: () => pendingWin,
        };
    },
};
