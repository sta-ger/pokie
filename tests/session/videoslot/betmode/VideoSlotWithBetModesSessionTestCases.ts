import {
    BetModeSessionState,
    BuildableFromSessionState,
    ConvertableToSessionState,
    ForcingBetModeSelectionRejectedError,
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

// Regression: selecting the buy-bonus mode while a free-games round is already active must be
// rejected outright, not silently accepted and left to auto-fire once the round finishes (a
// latent/deferred buy). See testNoLatentBuyAfterFeatureEndsWithoutFreshExplicitPurchase for the full
// end-to-end lifecycle this protects.
export const testSelectingForcingModeDuringActiveFreeGamesIsRejected = (
    session: VideoSlotWithBetModesSession<string>,
    innerSession: VideoSlotWithFreeGamesSessionHandling,
): void => {
    innerSession.setFreeGamesSum(3);
    innerSession.setFreeGamesNum(1); // mid an unrelated, already-active free-games round

    expect(() => session.setBetMode("buy-bonus")).toThrow(ForcingBetModeSelectionRejectedError);
    expect(session.getBetModeId()).toBe("base"); // the rejected selection never took effect

    const creditsBefore = session.getCreditsAmount();
    session.play();

    expect(innerSession.getFreeGamesSum()).toBe(3); // unchanged -- no grant was ever attempted
    expect(innerSession.getFreeGamesNum()).toBe(2); // the round simply continued under "base"
    expect(session.getCreditsAmount()).toBe(creditsBefore); // a free spin -- nothing charged
};

// Non-forcing modes are never restricted by the active-feature guard -- only forcesFeatureEntry()
// modes are gated, so ante-style persistent modes must remain freely selectable at any time.
export const testNonForcingModeStaysSelectableDuringActiveFreeGames = (
    session: VideoSlotWithBetModesSession<string>,
    innerSession: VideoSlotWithFreeGamesSessionHandling,
): void => {
    innerSession.setFreeGamesSum(3);
    innerSession.setFreeGamesNum(1); // mid an active free-games round

    expect(() => session.setBetMode("ante")).not.toThrow();
    expect(session.getBetModeId()).toBe("ante");
};

// Regression: the full lifecycle this stabilization protects. Selecting a forcing mode mid an
// already-active free-games round is rejected; playing the round out to completion must not leave
// any latent purchase behind; and the very next ordinary spin after the round ends must behave like
// a plain spin under whatever mode was actually selected -- never an unrequested, auto-charged buy.
// A genuinely fresh, explicit setBetMode() call made only after the round is over must still work.
export const testNoLatentBuyAfterFeatureEndsWithoutFreshExplicitPurchase = (
    session: VideoSlotWithBetModesSession<string>,
    innerSession: VideoSlotWithFreeGamesSessionHandling,
    freeGamesToGrant: number,
): void => {
    innerSession.setFreeGamesSum(2);
    innerSession.setFreeGamesNum(0); // an unrelated free-games round, 2 spins remaining

    expect(session.getBetModeId()).toBe("base");
    expect(() => session.setBetMode("buy-bonus")).toThrow(ForcingBetModeSelectionRejectedError);
    expect(session.getBetModeId()).toBe("base");

    // Play the active round out to completion under the unchanged ("base") mode.
    while (innerSession.getFreeGamesNum() < innerSession.getFreeGamesSum()) {
        session.play();
    }
    expect(innerSession.getFreeGamesNum()).toBe(2);
    expect(innerSession.getFreeGamesSum()).toBe(2); // no extra grant snuck in anywhere along the way

    // The very next ordinary spin, with no fresh setBetMode("buy-bonus") call since the round ended,
    // must be a plain, normal-cost spin -- not an unrequested buy.
    const bet = session.getBet();
    const creditsBeforeOrdinarySpin = session.getCreditsAmount();
    session.play();

    expect(session.getCreditsAmount()).toBe(creditsBeforeOrdinarySpin - bet + session.getWinAmount());
    expect(innerSession.getFreeGamesSum()).toBe(0); // the finished round was cleared, no new bonus forced

    // A genuinely fresh, explicit purchase now (after the round is truly over) still works normally.
    expect(() => session.setBetMode("buy-bonus")).not.toThrow();
    const stakeAmount = session.getStakeAmount();
    const creditsBeforeBuy = session.getCreditsAmount();
    session.play();

    expect(session.getCreditsAmount()).toBe(creditsBeforeBuy - stakeAmount);
    expect(innerSession.getFreeGamesSum()).toBe(freeGamesToGrant); // a genuinely new bonus was granted
    expect(innerSession.getFreeGamesNum()).toBe(1);
};

// Regression: the full one-shot purchase lifecycle. An explicit buy forces entry and charges once;
// the bonus plays out to completion without any further charge/grant; the very next ordinary spin --
// with no new explicit setBetMode() call -- is a plain, normal-cost spin, not an unrequested
// repurchase; and a genuinely new explicit buy afterward still works exactly like the first one.
export const testForcingModeIsOneShotNotPersistentAcrossACompleteBonusLifecycle = (
    session: VideoSlotWithBetModesSession<string>,
    innerSession: VideoSlotWithFreeGamesSessionHandling,
    freeGamesToGrant: number,
): void => {
    session.setCreditsAmount(Number.MAX_SAFE_INTEGER);

    // Explicit buy.
    expect(session.getBetModeId()).toBe("base");
    session.setBetMode("buy-bonus");
    session.play();

    // Reverted to the default mode immediately -- a one-shot purchase, not a persistent selection.
    expect(session.getBetModeId()).toBe("base");
    expect(innerSession.getFreeGamesSum()).toBe(freeGamesToGrant);
    expect(innerSession.getFreeGamesNum()).toBe(1);

    // Bonus plays out to completion.
    while (innerSession.getFreeGamesNum() < innerSession.getFreeGamesSum()) {
        session.play();
        expect(innerSession.getFreeGamesSum()).toBe(freeGamesToGrant); // never re-grants along the way
    }
    expect(innerSession.getFreeGamesNum()).toBe(freeGamesToGrant);

    // The next play(), with no new explicit buy, is a plain normal-cost spin -- no forced entry.
    const bet = session.getBet();
    const creditsBeforeOrdinarySpin = session.getCreditsAmount();
    session.play();

    expect(session.getCreditsAmount()).toBe(creditsBeforeOrdinarySpin - bet + session.getWinAmount());
    expect(innerSession.getFreeGamesSum()).toBe(0); // no bonus was forced

    // A genuinely new explicit buy afterward works again, exactly like the first one.
    session.setBetMode("buy-bonus");
    const stakeAmount = session.getStakeAmount();
    const creditsBeforeSecondBuy = session.getCreditsAmount();
    session.play();

    expect(session.getCreditsAmount()).toBe(creditsBeforeSecondBuy - stakeAmount);
    expect(session.getBetModeId()).toBe("base"); // reverted again after this purchase too
    expect(innerSession.getFreeGamesSum()).toBe(freeGamesToGrant); // a genuinely new bonus was granted
    expect(innerSession.getFreeGamesNum()).toBe(1);
};

// Regression: unlike a one-shot forcing mode, a persistent (non-forcing) mode like ante never
// auto-reverts -- it stays selected, and keeps applying its multiplier, across as many spins as the
// caller wants, until they explicitly change it themselves.
export const testAnteModeStaysPersistentAcrossMultipleSpins = (session: VideoSlotWithBetModesSession<string>): void => {
    session.setBetMode("ante");
    const bet = session.getBet();

    for (let i = 0; i < 3; i++) {
        expect(session.getBetModeId()).toBe("ante"); // never auto-reverts, unlike a forcing mode
        const creditsBefore = session.getCreditsAmount();
        session.play();
        expect(session.getCreditsAmount()).toBe(creditsBefore - bet * 1.25 + session.getWinAmount());
    }

    expect(session.getBetModeId()).toBe("ante"); // still the caller's own persistent choice
};

// Regression: a state snapshot captured any time after a successful purchase (including mid the
// bought round) never carries a "consumed" buy intent to restore -- there's no separate flag to lose
// or misrestore, because the mode itself is already back to the default the instant the purchase
// succeeded (see VideoSlotWithBetModesSession.play()). Restoring must not resurrect the purchase.
export const testSerializationDoesNotResurrectAConsumedBuyIntent = (
    session: VideoSlotWithBetModesSession<string> &
        ConvertableToSessionState<BetModeSessionState> &
        BuildableFromSessionState<BetModeSessionState>,
    otherSession: VideoSlotWithBetModesSession<string> & BuildableFromSessionState<BetModeSessionState>,
    otherInnerSession: VideoSlotWithFreeGamesSessionHandling,
): void => {
    session.setCreditsAmount(Number.MAX_SAFE_INTEGER);
    session.setBetMode("buy-bonus");
    session.play(); // successful buy -- mode already reverted to "base" before this returns

    expect(session.getBetModeId()).toBe("base");

    const state = session.toSessionState();
    expect(state.betModeId).toBe("base"); // nothing "consumed" was ever there to capture

    otherSession.setCreditsAmount(Number.MAX_SAFE_INTEGER);
    otherSession.fromSessionState(state);

    expect(otherSession.getBetModeId()).toBe("base");

    // Playing the restored bonus round out, then one more ordinary spin, must never re-force entry or
    // re-charge the buy cost.
    while (otherInnerSession.getFreeGamesNum() < otherInnerSession.getFreeGamesSum()) {
        otherSession.play();
    }
    const bet = otherSession.getBet();
    const creditsBefore = otherSession.getCreditsAmount();
    otherSession.play();

    expect(otherSession.getCreditsAmount()).toBe(creditsBefore - bet + otherSession.getWinAmount());
    expect(otherInnerSession.getFreeGamesSum()).toBe(0);
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
