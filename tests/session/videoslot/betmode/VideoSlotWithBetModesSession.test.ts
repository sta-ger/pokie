import {
    BetModeDefinition,
    BetModesConfig,
    ForcedFeatureEntryUnsupportedError,
    ForcingBetModeSelectionRejectedError,
    FreeGamesForcedFeatureEntryHandler,
    NoOpForcedFeatureEntryHandler,
    SymbolsCombinationsGenerator,
    VideoSlotSession,
    VideoSlotWinCalculator,
    VideoSlotWithBetModesSession,
    VideoSlotWithFreeGamesConfig,
    VideoSlotWithFreeGamesConfigRepresenting,
    VideoSlotWithFreeGamesSession,
} from "pokie";
import {
    testAnteModeChargesTheMultipliedStake,
    testAnteModeGatesCanPlayNextGameOnTheFullCost,
    testAnteModeStaysPersistentAcrossMultipleSpins,
    testBuyBonusForcesFeatureEntryAndChargesTheBuyCost,
    testBuyBonusIsOneShotAndTheBonusRoundTerminates,
    testDefaultBetModeBehavesLikeThePlainSession,
    testForcedEntryUnsupportedByHandlerFailsExplicitlyWithoutCharging,
    testForcingModeIsOneShotNotPersistentAcrossACompleteBonusLifecycle,
    testInsufficientBaseCreditsBlockPlayRegardlessOfMode,
    testInvalidBetModeThrowsAndLeavesTheCurrentModeUnchanged,
    testNoLatentBuyAfterFeatureEndsWithoutFreshExplicitPurchase,
    testNonForcingModeStaysSelectableDuringActiveFreeGames,
    testSelectingForcingModeDuringActiveFreeGamesIsRejected,
    testSerializationDoesNotResurrectAConsumedBuyIntent,
    testSessionStateRoundTripCarriesModeAlone,
    testSessionStateRoundTripCarriesModeAndNestedFreeGamesState,
} from "./VideoSlotWithBetModesSessionTestCases.js";

const anteModesConfig = (): BetModesConfig =>
    new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 1.25})], "base");

const FREE_GAMES_TO_GRANT = 5;

const buyBonusModesConfig = (): BetModesConfig =>
    new BetModesConfig(
        [new BetModeDefinition("base"), new BetModeDefinition("buy-bonus", {stakeMultiplier: 50, forcesFeatureEntry: true})],
        "base",
    );

// Disables every natural scatter-triggered free-games award, so the only source of free games in a
// test using this config is an explicit forced entry -- required for asserting an exact
// getFreeGamesSum()/getFreeGamesNum() count without RNG-driven retriggers muddying it.
const createFreeGamesConfigWithNoNaturalTriggers = (): VideoSlotWithFreeGamesConfigRepresenting => {
    const config = new VideoSlotWithFreeGamesConfig();
    config.getScatterSymbols().forEach((scatter) => {
        for (let i = 0; i < config.getReelsNumber() * config.getReelsSymbolsNumber(); i++) {
            config.setFreeGamesForScatters(scatter, i, 0);
        }
    });
    return config;
};

const createFreeGamesSessionWithNoNaturalTriggers = (): VideoSlotWithFreeGamesSession => {
    const config = createFreeGamesConfigWithNoNaturalTriggers();
    return new VideoSlotWithFreeGamesSession(config, new SymbolsCombinationsGenerator(config), new VideoSlotWinCalculator(config));
};

describe("VideoSlotWithBetModesSession", () => {
    it("behaves exactly like the wrapped session when no bet modes are configured", () => {
        const session = new VideoSlotWithBetModesSession(new VideoSlotSession());
        testDefaultBetModeBehavesLikeThePlainSession(session);
    });

    it("charges the ante multiplier as extra stake on top of the normal bet", () => {
        const session = new VideoSlotWithBetModesSession(new VideoSlotSession(), anteModesConfig());
        testAnteModeChargesTheMultipliedStake(session);
    });

    it("gates canPlayNextGame()/play() on the full ante-multiplied cost, not just the base bet", () => {
        const session = new VideoSlotWithBetModesSession(new VideoSlotSession(), anteModesConfig());
        testAnteModeGatesCanPlayNextGameOnTheFullCost(session);
    });

    it("still blocks play() when the wrapped session itself can't afford the plain bet, under the default mode", () => {
        const session = new VideoSlotWithBetModesSession(new VideoSlotSession());
        testInsufficientBaseCreditsBlockPlayRegardlessOfMode(session);
    });

    it("throws UnknownBetModeError for an unconfigured mode id and leaves the current mode unchanged", () => {
        const session = new VideoSlotWithBetModesSession(new VideoSlotSession(), anteModesConfig());
        testInvalidBetModeThrowsAndLeavesTheCurrentModeUnchanged(session);
    });

    it("forces free-games entry and charges exactly getStakeAmount() as the buy cost", () => {
        const innerSession = new VideoSlotWithFreeGamesSession();
        const session = new VideoSlotWithBetModesSession(
            innerSession,
            buyBonusModesConfig(),
            new FreeGamesForcedFeatureEntryHandler(FREE_GAMES_TO_GRANT),
        );
        testBuyBonusForcesFeatureEntryAndChargesTheBuyCost(session, innerSession, FREE_GAMES_TO_GRANT);
    });

    it("grants free games exactly once per purchase and the bonus round actually terminates", () => {
        const innerSession = createFreeGamesSessionWithNoNaturalTriggers();
        const session = new VideoSlotWithBetModesSession(
            innerSession,
            buyBonusModesConfig(),
            new FreeGamesForcedFeatureEntryHandler(FREE_GAMES_TO_GRANT),
        );
        testBuyBonusIsOneShotAndTheBonusRoundTerminates(session, innerSession, FREE_GAMES_TO_GRANT);
    });

    it("rejects selecting the buy-bonus mode mid an already-active free-games round", () => {
        const innerSession = createFreeGamesSessionWithNoNaturalTriggers();
        const session = new VideoSlotWithBetModesSession(
            innerSession,
            buyBonusModesConfig(),
            new FreeGamesForcedFeatureEntryHandler(FREE_GAMES_TO_GRANT),
        );
        testSelectingForcingModeDuringActiveFreeGamesIsRejected(session, innerSession);
    });

    it("throws the typed ForcingBetModeSelectionRejectedError, carrying the offending mode id", () => {
        const innerSession = createFreeGamesSessionWithNoNaturalTriggers();
        const session = new VideoSlotWithBetModesSession(
            innerSession,
            buyBonusModesConfig(),
            new FreeGamesForcedFeatureEntryHandler(FREE_GAMES_TO_GRANT),
        );
        innerSession.setFreeGamesSum(3);
        innerSession.setFreeGamesNum(1);

        try {
            session.setBetMode("buy-bonus");
            throw new Error("expected setBetMode() to throw");
        } catch (error) {
            expect(error).toBeInstanceOf(ForcingBetModeSelectionRejectedError);
            expect((error as ForcingBetModeSelectionRejectedError).getModeId()).toBe("buy-bonus");
        }
    });

    it("still allows selecting a non-forcing (ante) mode mid an already-active free-games round", () => {
        const innerSession = createFreeGamesSessionWithNoNaturalTriggers();
        const session = new VideoSlotWithBetModesSession(
            innerSession,
            new BetModesConfig(
                [
                    new BetModeDefinition("base"),
                    new BetModeDefinition("ante", {stakeMultiplier: 1.25}),
                    new BetModeDefinition("buy-bonus", {stakeMultiplier: 50, forcesFeatureEntry: true}),
                ],
                "base",
            ),
            new FreeGamesForcedFeatureEntryHandler(FREE_GAMES_TO_GRANT),
        );
        testNonForcingModeStaysSelectableDuringActiveFreeGames(session, innerSession);
    });

    it("regression: no latent/deferred buy -- a rejected mid-feature selection never auto-fires once the round ends", () => {
        const innerSession = createFreeGamesSessionWithNoNaturalTriggers();
        const session = new VideoSlotWithBetModesSession(
            innerSession,
            buyBonusModesConfig(),
            new FreeGamesForcedFeatureEntryHandler(FREE_GAMES_TO_GRANT),
        );
        testNoLatentBuyAfterFeatureEndsWithoutFreshExplicitPurchase(session, innerSession, FREE_GAMES_TO_GRANT);
    });

    it("regression: forcing mode is one-shot, not persistent, across a complete buy -> bonus -> ordinary-spin -> fresh-buy lifecycle", () => {
        const innerSession = createFreeGamesSessionWithNoNaturalTriggers();
        const session = new VideoSlotWithBetModesSession(
            innerSession,
            buyBonusModesConfig(),
            new FreeGamesForcedFeatureEntryHandler(FREE_GAMES_TO_GRANT),
        );
        testForcingModeIsOneShotNotPersistentAcrossACompleteBonusLifecycle(session, innerSession, FREE_GAMES_TO_GRANT);
    });

    it("ante mode stays persistent (never auto-reverts) across repeated spins", () => {
        const session = new VideoSlotWithBetModesSession(new VideoSlotSession(), anteModesConfig());
        testAnteModeStaysPersistentAcrossMultipleSpins(session);
    });

    it("serialization/replay never resurrects an already-consumed buy intent", () => {
        const innerSession = createFreeGamesSessionWithNoNaturalTriggers();
        const session = new VideoSlotWithBetModesSession(
            innerSession,
            buyBonusModesConfig(),
            new FreeGamesForcedFeatureEntryHandler(FREE_GAMES_TO_GRANT),
        );
        const otherInnerSession = createFreeGamesSessionWithNoNaturalTriggers();
        const otherSession = new VideoSlotWithBetModesSession(
            otherInnerSession,
            buyBonusModesConfig(),
            new FreeGamesForcedFeatureEntryHandler(FREE_GAMES_TO_GRANT),
        );
        testSerializationDoesNotResurrectAConsumedBuyIntent(session, otherSession, otherInnerSession);
    });

    it("fails explicitly instead of silently charging when the default no-op handler can't perform entry", () => {
        const session = new VideoSlotWithBetModesSession(new VideoSlotSession(), buyBonusModesConfig(), new NoOpForcedFeatureEntryHandler());
        testForcedEntryUnsupportedByHandlerFailsExplicitlyWithoutCharging(session);
    });

    it("fails explicitly (not just no-op) when a capable handler is wired to a session it can't act on", () => {
        // FreeGamesForcedFeatureEntryHandler is a real, capable handler in general -- but this
        // session is a plain VideoSlotSession with no free-games state at all, so it still can't
        // perform entry here, and that must fail loudly rather than quietly charging nothing for it.
        const session = new VideoSlotWithBetModesSession(
            new VideoSlotSession(),
            buyBonusModesConfig(),
            new FreeGamesForcedFeatureEntryHandler(FREE_GAMES_TO_GRANT),
        );
        testForcedEntryUnsupportedByHandlerFailsExplicitlyWithoutCharging(session);
    });

    it("throws the typed ForcedFeatureEntryUnsupportedError, carrying the offending mode id", () => {
        const session = new VideoSlotWithBetModesSession(new VideoSlotSession(), buyBonusModesConfig(), new NoOpForcedFeatureEntryHandler());
        session.setBetMode("buy-bonus");

        try {
            session.play();
            throw new Error("expected play() to throw");
        } catch (error) {
            expect(error).toBeInstanceOf(ForcedFeatureEntryUnsupportedError);
            expect((error as ForcedFeatureEntryUnsupportedError).getModeId()).toBe("buy-bonus");
        }
    });

    it("round-trips the selected bet mode alone via toSessionState/fromSessionState", () => {
        const session = new VideoSlotWithBetModesSession(new VideoSlotSession(), anteModesConfig());
        const otherSession = new VideoSlotWithBetModesSession(new VideoSlotSession(), anteModesConfig());
        testSessionStateRoundTripCarriesModeAlone(session, otherSession);
    });

    it("round-trips the selected bet mode together with nested free-games state -- deterministic replay", () => {
        const innerSession = new VideoSlotWithFreeGamesSession();
        const session = new VideoSlotWithBetModesSession(innerSession, anteModesConfig());
        const otherInnerSession = new VideoSlotWithFreeGamesSession();
        const otherSession = new VideoSlotWithBetModesSession(otherInnerSession, anteModesConfig());

        testSessionStateRoundTripCarriesModeAndNestedFreeGamesState(session, innerSession, otherSession, otherInnerSession);
    });
});
