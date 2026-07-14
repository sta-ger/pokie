import {
    RoundArtifactProvenance,
    SymbolsCombination,
    VideoSlotConfig,
    VideoSlotWinCalculator,
    buildRoundArtifact,
    buildRoundStepArtifact,
} from "pokie";

const provenance: RoundArtifactProvenance = {
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    pokieVersion: "1.3.0",
};

function winningResult() {
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
    return {screen: symbols.toMatrix(), winEvaluationResult: winCalculator.getWinEvaluationResult()};
}

function losingResult() {
    const config = new VideoSlotConfig();
    const winCalculator = new VideoSlotWinCalculator(config);
    const symbols = new SymbolsCombination<string>().fromMatrix([
        ["Q", "J", "10"],
        ["J", "9", "Q"],
        ["10", "Q", "J"],
        ["9", "10", "Q"],
        ["J", "Q", "9"],
    ]);
    winCalculator.calculateWin(config.getAvailableBets()[0], symbols);
    return {screen: symbols.toMatrix(), winEvaluationResult: winCalculator.getWinEvaluationResult()};
}

describe("buildRoundStepArtifact", () => {
    it("maps a WinEvaluationResult's own components without recalculating them", () => {
        const source = winningResult();
        const step = buildRoundStepArtifact(0, source);

        expect(step.index).toBe(0);
        expect(step.screen).toEqual(source.screen);
        expect(step.totalWin).toBe(source.winEvaluationResult.getTotalWin());
        expect(step.totalWin).toBeGreaterThan(0);
        expect(step.wins).toHaveLength(source.winEvaluationResult.getWinComponents().length);
        step.wins.forEach((win, index) => {
            const component = source.winEvaluationResult.getWinComponents()[index];
            expect(win.type).toBe(component.getType());
            expect(win.id).toBe(component.getId());
            expect(win.symbolId).toBe(component.getSymbolId());
            expect(win.winAmount).toBe(component.getWinAmount());
            expect(win.winningPositions).toEqual(component.getWinningPositions());
            expect(win.metadata).toEqual(component.getMetadata());
        });
    });

    it("carries optional featureEvents/debug through untouched", () => {
        const source = losingResult();
        const step = buildRoundStepArtifact(2, {
            ...source,
            featureEvents: [{type: "custom", data: {foo: 1}}],
            debug: {rngSeed: "abc"},
        });

        expect(step.index).toBe(2);
        expect(step.featureEvents).toEqual([{type: "custom", data: {foo: 1}}]);
        expect(step.debug).toEqual({rngSeed: "abc"});
    });

    it("omits featureEvents/debug when not given", () => {
        const step = buildRoundStepArtifact(0, losingResult());
        expect(step.featureEvents).toBeUndefined();
        expect(step.debug).toBeUndefined();
    });
});

describe("buildRoundArtifact", () => {
    it("builds a single-step artifact with a consistent payoutMultiplier", () => {
        const source = winningResult();
        const stake = 1;

        const artifact = buildRoundArtifact({
            roundId: "round-1",
            provenance,
            stake,
            steps: [source],
        });

        expect(artifact.roundId).toBe("round-1");
        expect(artifact.provenance).toEqual(provenance);
        expect(artifact.betMode).toBe("base");
        expect(artifact.stake).toBe(stake);
        expect(artifact.totalWin).toBe(source.winEvaluationResult.getTotalWin());
        expect(artifact.payoutMultiplier).toBe(artifact.totalWin / stake);
        expect(artifact.screen).toEqual(source.screen);
        expect(artifact.steps).toHaveLength(1);
        expect(artifact.wins).toEqual(artifact.steps[0].wins);
    });

    it("reports a zero payoutMultiplier when stake is zero, instead of dividing by zero", () => {
        const artifact = buildRoundArtifact({
            roundId: "round-free",
            provenance,
            betMode: "freeGames",
            stake: 0,
            steps: [winningResult()],
        });

        expect(artifact.payoutMultiplier).toBe(0);
        expect(artifact.betMode).toBe("freeGames");
    });

    it("folds totalWin/wins/screen across multiple steps, keeping the last step's screen", () => {
        const stepA = winningResult();
        const stepB = losingResult();
        const stepC = winningResult();

        const artifact = buildRoundArtifact({
            roundId: "round-cascade",
            provenance,
            stake: 1,
            steps: [stepA, stepB, stepC],
        });

        expect(artifact.steps.map((step) => step.index)).toEqual([0, 1, 2]);
        expect(artifact.totalWin).toBe(
            stepA.winEvaluationResult.getTotalWin() +
                stepB.winEvaluationResult.getTotalWin() +
                stepC.winEvaluationResult.getTotalWin(),
        );
        expect(artifact.wins).toHaveLength(
            stepA.winEvaluationResult.getWinComponents().length +
                stepB.winEvaluationResult.getWinComponents().length +
                stepC.winEvaluationResult.getWinComponents().length,
        );
        expect(artifact.screen).toEqual(stepC.screen);
    });

    it("flattens each step's featureEvents into the round-level featureEvents, plus any extra supplied", () => {
        const artifact = buildRoundArtifact({
            roundId: "round-events",
            provenance,
            stake: 1,
            steps: [
                {...losingResult(), featureEvents: [{type: "cascadeStep"}]},
                {...losingResult(), featureEvents: [{type: "freeGamesTriggered", data: {count: 8}}]},
            ],
            featureEvents: [{type: "roundLevelNote"}],
        });

        expect(artifact.featureEvents).toEqual([
            {type: "cascadeStep"},
            {type: "freeGamesTriggered", data: {count: 8}},
            {type: "roundLevelNote"},
        ]);
    });

    it("does not mutate the caller's provenance object", () => {
        const ownProvenance: RoundArtifactProvenance = {...provenance, game: {...provenance.game}};
        const artifact = buildRoundArtifact({roundId: "r", provenance: ownProvenance, stake: 1, steps: [losingResult()]});

        artifact.provenance.game.name = "mutated";
        expect(ownProvenance.game.name).toBe("Crazy Fruits");
    });
});
