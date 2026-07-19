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
    expect(session.getStakeAmount()).toBe(bet * 50);
    expect(innerSession.getFreeGamesSum()).toBe(0);

    const creditsBefore = session.getCreditsAmount();
    session.play();

    // The buy spin itself is played as the first free game: its own stake/win are banked (not paid
    // out) by the free-games decorator, so only the ante-style extra cost (multiplier - 1) ever
    // actually leaves the balance -- deterministic regardless of the round's win amount.
    expect(session.getCreditsAmount()).toBe(creditsBefore - bet * 49);
    expect(innerSession.getFreeGamesSum()).toBeGreaterThanOrEqual(freeGamesToGrant);
    expect(innerSession.getFreeGamesNum()).toBe(1);
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
