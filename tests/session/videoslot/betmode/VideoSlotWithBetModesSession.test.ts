import {
    BetModeDefinition,
    BetModesConfig,
    ForcedFeatureEntryHandling,
    ForcedFeatureEntryUnsupportedError,
    ForcingBetModeSelectionRejectedError,
    FreeGamesForcedFeatureEntryHandler,
    FreeGamesStateDetermining,
    FreeGamesStateSetting,
    NoOpForcedFeatureEntryHandler,
    PerModeForcedFeatureEntryHandler,
    SymbolsCombinationsGenerator,
    VideoSlotSession,
    VideoSlotSessionHandling,
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

    describe("backward compatibility with pre-existing ForcedFeatureEntryHandling implementations/call sites", () => {
        // Stands in for external code written against ForcedFeatureEntryHandling before
        // ModeAwareForcedFeatureEntryHandling existed: a plain class with only the original
        // single-argument methods, no knowledge of BetModeDescribing or any "mode" parameter at all.
        // This must keep compiling (a class declaring FEWER methods/parameters than an interface
        // requires is never valid -- this class satisfies ForcedFeatureEntryHandling exactly, not more)
        // and keep working when wired into VideoSlotWithBetModesSession.
        class LegacyCountingForcedFeatureEntryHandler implements ForcedFeatureEntryHandling {
            public timesForced = 0;

            public canForceFeatureEntry(session: VideoSlotSessionHandling): boolean {
                return typeof (session as Partial<FreeGamesStateSetting>).setFreeGamesSum === "function";
            }

            public forceFeatureEntry(session: VideoSlotSessionHandling): void {
                this.timesForced++;
                const freeGamesSession = session as unknown as FreeGamesStateSetting & FreeGamesStateDetermining;
                freeGamesSession.setFreeGamesSum(freeGamesSession.getFreeGamesSum() + FREE_GAMES_TO_GRANT);
            }
        }

        it("a legacy, mode-agnostic handler (single-argument methods only) still forces entry correctly through VideoSlotWithBetModesSession", () => {
            const innerSession = createFreeGamesSessionWithNoNaturalTriggers();
            const legacyHandler = new LegacyCountingForcedFeatureEntryHandler();
            const session = new VideoSlotWithBetModesSession(innerSession, buyBonusModesConfig(), legacyHandler);
            session.setCreditsAmount(1000);

            session.setBetMode("buy-bonus");
            session.play();

            expect(legacyHandler.timesForced).toBe(1);
            expect(session.getBetModeId()).toBe("base"); // one-shot, exactly as with a mode-aware handler
            expect(innerSession.getFreeGamesSum()).toBe(FREE_GAMES_TO_GRANT);
        });

        it("external code typed against the plain ForcedFeatureEntryHandling interface can still call canForceFeatureEntry(session)/forceFeatureEntry(session) with a single argument", () => {
            // The type annotation here is the actual compatibility assertion: if
            // ForcedFeatureEntryHandling ever required a second (mode) parameter again, this line
            // would fail to typecheck (tsc, not just at runtime) -- exactly the external call site the
            // stabilization after 399d3e2 exists to keep working.
            const handler: ForcedFeatureEntryHandling = new LegacyCountingForcedFeatureEntryHandler();
            const session = new VideoSlotWithFreeGamesSession();

            expect(handler.canForceFeatureEntry(session)).toBe(true);
            handler.forceFeatureEntry(session);
            expect(session.getFreeGamesSum()).toBe(FREE_GAMES_TO_GRANT);
        });
    });

    describe("regression: several differently-priced buyFeature modes on one session", () => {
        it("routes each buyFeature mode to its own handler via PerModeForcedFeatureEntryHandler, never confusing costs/grants", () => {
            const innerSession = createFreeGamesSessionWithNoNaturalTriggers();
            const modesConfig = new BetModesConfig(
                [
                    new BetModeDefinition("base"),
                    new BetModeDefinition("buy-10", {stakeMultiplier: 50, forcesFeatureEntry: true}),
                    new BetModeDefinition("buy-20", {stakeMultiplier: 100, forcesFeatureEntry: true}),
                ],
                "base",
            );
            const handler = new PerModeForcedFeatureEntryHandler(
                new Map([
                    ["buy-10", new FreeGamesForcedFeatureEntryHandler(10)],
                    ["buy-20", new FreeGamesForcedFeatureEntryHandler(20)],
                ]),
            );
            const session = new VideoSlotWithBetModesSession(innerSession, modesConfig, handler);
            session.setCreditsAmount(Number.MAX_SAFE_INTEGER);

            session.setBetMode("buy-10");
            const stake10 = session.getStakeAmount();
            expect(stake10).toBe(session.getBet() * 50);
            session.play();
            expect(session.getBetModeId()).toBe("base"); // one-shot -- reverted after the purchase
            expect(innerSession.getFreeGamesSum()).toBe(10);

            // Exhaust buy-10's granted free round entirely (fixed, deterministic count -- natural
            // triggers are disabled) before buying again: setBetMode() rejects selecting another
            // forcing mode while a zero-stake round is still active.
            for (let i = 0; i < 10; i++) {
                session.play();
            }
            expect(session.getStakeAmount()).toBeGreaterThan(0);

            const sumBeforeBuy20 = innerSession.getFreeGamesSum();
            session.setBetMode("buy-20");
            const stake20 = session.getStakeAmount();
            expect(stake20).toBe(session.getBet() * 100);
            expect(stake20).not.toBe(stake10); // never confused with buy-10's price
            session.play();
            expect(session.getBetModeId()).toBe("base");
            // getFreeGamesSum() accumulates (it's never reset mid this assertion -- the wrapped
            // session's own beforeRoundPlayed() only resets once its round is fully replayed), so the
            // grant this purchase actually added is the delta, not the raw total -- and that delta must
            // be buy-20's own 20, never buy-10's 10.
            expect(innerSession.getFreeGamesSum() - sumBeforeBuy20).toBe(20);
        });
    });
});
