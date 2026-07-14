import {
    RoundArtifactProvenance,
    SymbolsCombination,
    VideoSlotConfig,
    VideoSlotSessionHandling,
    VideoSlotWinCalculator,
    WinEvaluationResult,
    buildRoundArtifactFromSession,
} from "pokie";

const provenance: RoundArtifactProvenance = {
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    pokieVersion: "1.3.0",
};

function winEvaluationResultWithWin(): WinEvaluationResult<string> {
    const config = new VideoSlotConfig();
    const winCalculator = new VideoSlotWinCalculator(config);
    const symbols = new SymbolsCombination<string>().fromMatrix([
        ["A", "A", "A"],
        ["A", "K", "Q"],
        ["A", "K", "Q"],
        ["K", "Q", "J"],
        ["Q", "J", "10"],
    ]);
    winCalculator.calculateWin(config.getAvailableBets()[0], symbols);
    return winCalculator.getWinEvaluationResult();
}

// A narrow fake covering only what buildRoundArtifactFromSession actually calls, cast to
// VideoSlotSessionHandling<string> the same way the codebase's own feature-detection helpers
// (determineStakeAmount, StakeBasedSimulationRoundCategoryDeterminer) narrow a session to an optional
// interface — not a full VideoSlotSessionHandling implementation.
function fakeSession(overrides: Record<string, unknown> = {}): VideoSlotSessionHandling<string> {
    const screen = [["A", "A", "A"]];
    return {
        getBet: () => 5,
        getSymbolsCombination: () => ({toMatrix: () => screen}),
        getWinEvaluationResult: () => winEvaluationResultWithWin(),
        ...overrides,
    } as unknown as VideoSlotSessionHandling<string>;
}

describe("buildRoundArtifactFromSession", () => {
    it("uses the session's own bet as stake when it does not implement StakeAmountDetermining", () => {
        const artifact = buildRoundArtifactFromSession(fakeSession(), {roundId: "r1", provenance});

        expect(artifact.stake).toBe(5);
        expect(artifact.betMode).toBe("base");
        expect(artifact.screen).toEqual([["A", "A", "A"]]);
        expect(artifact.totalWin).toBeGreaterThan(0);
        expect(artifact.featureEvents).toBeUndefined();
    });

    it("defers to StakeAmountDetermining.getStakeAmount() over the nominal bet, same as determineStakeAmount", () => {
        const session = fakeSession({getStakeAmount: () => 0});
        const artifact = buildRoundArtifactFromSession(session, {roundId: "r2", provenance});

        expect(artifact.stake).toBe(0);
        expect(artifact.payoutMultiplier).toBe(0);
    });

    it("lets an explicit stake override wins over both getBet() and getStakeAmount()", () => {
        const session = fakeSession({getStakeAmount: () => 0});
        const artifact = buildRoundArtifactFromSession(session, {roundId: "r3", provenance, stake: 2});

        expect(artifact.stake).toBe(2);
    });

    it("derives a freeGamesTriggered feature event when getWonFreeGamesNumber() reports a win", () => {
        const session = fakeSession({getWonFreeGamesNumber: () => 8});
        const artifact = buildRoundArtifactFromSession(session, {roundId: "r4", provenance});

        expect(artifact.featureEvents).toEqual([{type: "freeGamesTriggered", data: {count: 8}}]);
    });

    it("does not add a feature event when getWonFreeGamesNumber() reports zero", () => {
        const session = fakeSession({getWonFreeGamesNumber: () => 0});
        const artifact = buildRoundArtifactFromSession(session, {roundId: "r5", provenance});

        expect(artifact.featureEvents).toBeUndefined();
    });

    it("passes betMode through explicitly, never inferring it", () => {
        const artifact = buildRoundArtifactFromSession(fakeSession(), {roundId: "r6", provenance, betMode: "freeGames"});
        expect(artifact.betMode).toBe("freeGames");
    });
});
