import {
    BetModeDefinition,
    BetModesConfig,
    FreeGamesForcedFeatureEntryHandler,
    NoOpForcedFeatureEntryHandler,
    VideoSlotSession,
    VideoSlotWithBetModesSession,
    VideoSlotWithFreeGamesSession,
} from "pokie";
import {
    testAnteModeChargesTheMultipliedStake,
    testAnteModeGatesCanPlayNextGameOnTheFullCost,
    testBuyBonusForcesFeatureEntryAndChargesTheBuyCost,
    testDefaultBetModeBehavesLikeThePlainSession,
    testInsufficientBaseCreditsBlockPlayRegardlessOfMode,
    testInvalidBetModeThrowsAndLeavesTheCurrentModeUnchanged,
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

    it("forces free-games entry and charges the buy cost for a buy-bonus mode", () => {
        const innerSession = new VideoSlotWithFreeGamesSession();
        const session = new VideoSlotWithBetModesSession(
            innerSession,
            buyBonusModesConfig(),
            new FreeGamesForcedFeatureEntryHandler(FREE_GAMES_TO_GRANT),
        );
        testBuyBonusForcesFeatureEntryAndChargesTheBuyCost(session, innerSession, FREE_GAMES_TO_GRANT);
    });

    it("never forces entry through the default no-op handler even when a mode claims forcesFeatureEntry", () => {
        const innerSession = new VideoSlotWithFreeGamesSession();
        const session = new VideoSlotWithBetModesSession(innerSession, buyBonusModesConfig(), new NoOpForcedFeatureEntryHandler());

        session.setBetMode("buy-bonus");
        session.play();

        expect(innerSession.getFreeGamesSum()).toBe(0);
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
