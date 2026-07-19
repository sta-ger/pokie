import {
    BetModeSessionState,
    BuildableFromSessionState,
    ConvertableToSessionState,
    UnknownBetModeError,
    VideoSlotWithBetModesSession,
    VideoSlotWithFreeGamesSessionHandling,
} from "pokie";

export const testDefaultBetModeBehavesLikeThePlainSession = (
    session: VideoSlotWithBetModesSession<string>,
): void => {
    expect(session.getBetModeId()).toBe("base");

    const bet = session.getBet();
    expect(session.getStakeAmount()).toBe(bet);

    const creditsBefore = session.getCreditsAmount();
    session.play();

    // No configured bet modes beyond "base" (stakeMultiplier 1) -- charges exactly the normal bet,
    // same as the wrapped session on its own.
    expect(session.getCreditsAmount()).toBe(creditsBefore - bet + session.getWinAmount());
};

export const testInsufficientBaseCreditsBlockPlayRegardlessOfMode = (
    session: VideoSlotWithBetModesSession<string>,
): void => {
    session.setCreditsAmount(session.getBet() - 1); // below the plain bet -- the wrapped session itself refuses
    expect(session.canPlayNextGame()).toBe(false);

    const creditsBefore = session.getCreditsAmount();
    session.play();

    expect(session.getCreditsAmount()).toBe(creditsBefore); // nothing charged, no forced entry attempted
};

export const testAnteModeChargesTheMultipliedStake = (session: VideoSlotWithBetModesSession<string>): void => {
    session.setBetMode("ante");
    const bet = session.getBet();
    expect(session.getStakeAmount()).toBe(bet * 1.25);

    const creditsBefore = session.getCreditsAmount();
    session.play();

    expect(session.getCreditsAmount()).toBe(creditsBefore - bet * 1.25 + session.getWinAmount());
};

export const testAnteModeGatesCanPlayNextGameOnTheFullCost = (
    session: VideoSlotWithBetModesSession<string>,
): void => {
    session.setBetMode("ante");
    const bet = session.getBet();

    session.setCreditsAmount(bet); // enough for the plain base session, not for the 1.25x ante cost
    expect(session.canPlayNextGame()).toBe(false);

    const creditsBefore = session.getCreditsAmount();
    session.play();
    expect(session.getCreditsAmount()).toBe(creditsBefore); // blocked -- nothing was charged

    session.setCreditsAmount(bet * 1.25);
    expect(session.canPlayNextGame()).toBe(true);
};

export const testInvalidBetModeThrowsAndLeavesTheCurrentModeUnchanged = (
    session: VideoSlotWithBetModesSession<string>,
): void => {
    expect(session.getBetModeId()).toBe("base");
    expect(() => session.setBetMode("does-not-exist")).toThrow(UnknownBetModeError);
    expect(session.getBetModeId()).toBe("base"); // the failed attempt never took effect
};

export const testBuyBonusForcesFeatureEntryAndChargesTheBuyCost = (
    session: VideoSlotWithBetModesSession<string>,
    innerSession: VideoSlotWithFreeGamesSessionHandling,
    freeGamesToGrant: number,
): void => {
    session.setBetMode("buy-bonus");
    const bet = session.getBet();
    const stakeAmount = session.getStakeAmount();
    expect(stakeAmount).toBe(bet * 50);
    expect(innerSession.getFreeGamesSum()).toBe(0);

    const creditsBefore = session.getCreditsAmount();
    session.play();

    // The buy spin itself is played as the first free game: its own stake/win are banked (not paid
    // out) by the free-games decorator. The full buy cost still has to actually leave the balance
    // though -- topped up on top of whatever that inner free spin nets to (0, banked) -- deterministic
    // regardless of the round's win amount, and always equal to getStakeAmount() read before play().
    expect(session.getCreditsAmount()).toBe(creditsBefore - stakeAmount);
    expect(innerSession.getFreeGamesSum()).toBeGreaterThanOrEqual(freeGamesToGrant);
    expect(innerSession.getFreeGamesNum()).toBe(1);
};

// Regression: forcing entry is one-shot per purchase -- a buy-bonus round must not re-grant
// freeGamesToGrant on every subsequent free spin (which would make the round effectively never end),
// and it must actually terminate after exactly the granted number of spins.
export const testBuyBonusIsOneShotAndTheBonusRoundTerminates = (
    session: VideoSlotWithBetModesSession<string>,
    innerSession: VideoSlotWithFreeGamesSessionHandling,
    freeGamesToGrant: number,
): void => {
    session.setCreditsAmount(Number.MAX_SAFE_INTEGER);
    session.setBetMode("buy-bonus");
    session.play(); // the buy spin -- consumes free spin #1

    expect(innerSession.getFreeGamesSum()).toBe(freeGamesToGrant);
    expect(innerSession.getFreeGamesNum()).toBe(1);

    while (innerSession.getFreeGamesNum() < innerSession.getFreeGamesSum()) {
        session.play();
        // Never grows beyond the originally granted amount -- no re-grant on each free spin.
        expect(innerSession.getFreeGamesSum()).toBe(freeGamesToGrant);
    }

    expect(innerSession.getFreeGamesNum()).toBe(freeGamesToGrant); // the bonus round actually finished
};

// Regression: attempting to (re-)select the buy-bonus mode while a free-games round is already
// active must not grant extra free spins, and must not charge anything -- the spin just continues
// the existing round like any other free spin.
export const testBuyModeDuringActiveFreeGamesGrantsNoExtraSpinsOrCharge = (
    session: VideoSlotWithBetModesSession<string>,
    innerSession: VideoSlotWithFreeGamesSessionHandling,
): void => {
    innerSession.setFreeGamesSum(3);
    innerSession.setFreeGamesNum(1); // mid an unrelated, already-active free-games round

    session.setBetMode("buy-bonus");
    const creditsBefore = session.getCreditsAmount();

    session.play();

    expect(innerSession.getFreeGamesSum()).toBe(3); // unchanged -- no extra grant
    expect(innerSession.getFreeGamesNum()).toBe(2); // the round simply continued
    expect(session.getCreditsAmount()).toBe(creditsBefore); // nothing charged
};

// Regression: a forcing mode wired to a handler that can't actually perform entry against this
// session must fail explicitly, before charging or mutating anything -- never a silent no-op that
// still takes the buy/ante cost.
export const testForcedEntryUnsupportedByHandlerFailsExplicitlyWithoutCharging = (
    session: VideoSlotWithBetModesSession<string>,
): void => {
    session.setBetMode("buy-bonus");
    const creditsBefore = session.getCreditsAmount();

    expect(() => session.play()).toThrow(/cannot perform entry/);
    expect(session.getCreditsAmount()).toBe(creditsBefore);
};

export const testSessionStateRoundTripCarriesModeAlone = (
    session: VideoSlotWithBetModesSession<string> &
        ConvertableToSessionState<BetModeSessionState> &
        BuildableFromSessionState<BetModeSessionState>,
    otherSession: VideoSlotWithBetModesSession<string> & BuildableFromSessionState<BetModeSessionState>,
): void => {
    session.setBetMode("ante");

    const state = session.toSessionState();
    expect(state).toEqual({betModeId: "ante"});

    otherSession.fromSessionState(state);
    expect(otherSession.getBetModeId()).toBe("ante");
};

export const testSessionStateRoundTripCarriesModeAndNestedFreeGamesState = (
    session: VideoSlotWithBetModesSession<string> &
        ConvertableToSessionState<BetModeSessionState> &
        BuildableFromSessionState<BetModeSessionState>,
    innerSession: VideoSlotWithFreeGamesSessionHandling,
    otherSession: VideoSlotWithBetModesSession<string> & BuildableFromSessionState<BetModeSessionState>,
    otherInnerSession: VideoSlotWithFreeGamesSessionHandling,
): void => {
    session.setBetMode("ante");
    innerSession.setFreeGamesNum(1);
    innerSession.setFreeGamesSum(3);
    innerSession.setFreeGamesBank(50);

    const state = session.toSessionState();
    expect(state).toEqual({betModeId: "ante", base: {freeGamesNum: 1, freeGamesSum: 3, freeGamesBank: 50}});

    otherSession.fromSessionState(state);

    expect(otherSession.getBetModeId()).toBe("ante");
    expect(otherInnerSession.getFreeGamesNum()).toBe(1);
    expect(otherInnerSession.getFreeGamesSum()).toBe(3);
    expect(otherInnerSession.getFreeGamesBank()).toBe(50);
};
