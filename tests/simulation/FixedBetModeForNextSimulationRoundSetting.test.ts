import {
    BetModeDefinition,
    BetModesConfig,
    FixedBetModeForNextSimulationRoundSetting,
    GameSessionHandling,
    UnknownBetModeError,
    VideoSlotSession,
    VideoSlotWithBetModesSession,
    VideoSlotWithFreeGamesSession,
} from "pokie";

function createPlainFakeSession(): GameSessionHandling {
    return {
        getCreditsAmount: () => 1000,
        setCreditsAmount: () => undefined,
        getBet: () => 1,
        setBet: () => undefined,
        getAvailableBets: () => [1],
        canPlayNextGame: () => true,
        play: () => undefined,
        getWinAmount: () => 0,
    };
}

const buyBonusModesConfig = (): BetModesConfig =>
    new BetModesConfig(
        [new BetModeDefinition("base"), new BetModeDefinition("buy-bonus", {stakeMultiplier: 50, forcesFeatureEntry: true})],
        "base",
    );

describe("FixedBetModeForNextSimulationRoundSetting", () => {
    it("is a no-op against a session that doesn't support BetModeSelecting at all", () => {
        const session = createPlainFakeSession();

        expect(() => new FixedBetModeForNextSimulationRoundSetting("ante").setBetModeForNextRound(session)).not.toThrow();
    });

    it("selects the fixed mode on a session that supports BetModeSelecting", () => {
        const session = new VideoSlotWithBetModesSession(
            new VideoSlotSession(),
            new BetModesConfig([new BetModeDefinition("base"), new BetModeDefinition("ante", {stakeMultiplier: 1.25})], "base"),
        );

        new FixedBetModeForNextSimulationRoundSetting("ante").setBetModeForNextRound(session);

        expect(session.getBetModeId()).toBe("ante");
    });

    it("swallows ForcingBetModeSelectionRejectedError -- the round simply continues an already-active purchase", () => {
        const innerSession = new VideoSlotWithFreeGamesSession();
        innerSession.setFreeGamesSum(3);
        innerSession.setFreeGamesNum(1); // mid an active free-games round
        const session = new VideoSlotWithBetModesSession(innerSession, buyBonusModesConfig());

        expect(() => new FixedBetModeForNextSimulationRoundSetting("buy-bonus").setBetModeForNextRound(session)).not.toThrow();
        expect(session.getBetModeId()).toBe("base"); // the rejected re-selection never took effect
    });

    it("re-throws any other error -- an unknown mode id is a real simulation-config mistake, not something to swallow", () => {
        const session = new VideoSlotWithBetModesSession(new VideoSlotSession(), buyBonusModesConfig());

        expect(() => new FixedBetModeForNextSimulationRoundSetting("typo-mode").setBetModeForNextRound(session)).toThrow(
            UnknownBetModeError,
        );
    });
});
