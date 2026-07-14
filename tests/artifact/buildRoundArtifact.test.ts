import {
    RoundArtifactBuildError,
    RoundArtifactProvenance,
    SymbolsCombination,
    VideoSlotConfig,
    VideoSlotWinCalculator,
    WinEvaluationResult,
    WinningValue,
    ValueWinComponent,
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

function resultWithWinAmount(winAmount: number) {
    const winningValue = new WinningValue<string>("A", [[0, 0]], winAmount);
    const winEvaluationResult = new WinEvaluationResult<string>({
        valueWins: [new ValueWinComponent<string>(winningValue)],
    });
    return {screen: [["A"]], winEvaluationResult};
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

    it("throws RoundArtifactBuildError for a negative win amount", () => {
        expect(() => buildRoundStepArtifact(0, resultWithWinAmount(-5))).toThrow(RoundArtifactBuildError);
        try {
            buildRoundStepArtifact(0, resultWithWinAmount(-5));
            fail("expected buildRoundStepArtifact to throw");
        } catch (error) {
            expect(error).toBeInstanceOf(RoundArtifactBuildError);
            expect((error as InstanceType<typeof RoundArtifactBuildError>).getCode()).toBe("round-artifact-win-amount-invalid");
        }
    });

    it("throws RoundArtifactBuildError for a NaN win amount", () => {
        expect(() => buildRoundStepArtifact(0, resultWithWinAmount(NaN))).toThrow(RoundArtifactBuildError);
    });

    it("throws RoundArtifactBuildError for an Infinite win amount", () => {
        expect(() => buildRoundStepArtifact(0, resultWithWinAmount(Infinity))).toThrow(RoundArtifactBuildError);
    });

    it("throws RoundArtifactBuildError when debug contains a cyclic reference", () => {
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;

        expect(() => buildRoundStepArtifact(0, {...losingResult(), debug: cyclic})).toThrow(RoundArtifactBuildError);
    });

    it("throws RoundArtifactBuildError when feature event data contains a symbol", () => {
        expect(() =>
            buildRoundStepArtifact(0, {
                ...losingResult(),
                featureEvents: [{type: "custom", data: {value: Symbol("nope") as unknown as string}}],
            }),
        ).toThrow(RoundArtifactBuildError);
    });

    it("throws RoundArtifactBuildError when feature event data contains a bigint", () => {
        expect(() =>
            buildRoundStepArtifact(0, {
                ...losingResult(),
                featureEvents: [{type: "custom", data: {value: BigInt(1) as unknown as number}}],
            }),
        ).toThrow(RoundArtifactBuildError);
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

    describe("fail-fast input validation", () => {
        it("throws RoundArtifactBuildError for an empty steps list", () => {
            expect(() => buildRoundArtifact({roundId: "r", provenance, stake: 1, steps: []})).toThrow(RoundArtifactBuildError);
            try {
                buildRoundArtifact({roundId: "r", provenance, stake: 1, steps: []});
                fail("expected buildRoundArtifact to throw");
            } catch (error) {
                expect((error as InstanceType<typeof RoundArtifactBuildError>).getCode()).toBe("round-artifact-steps-empty");
            }
        });

        it.each(["", "   "])("throws RoundArtifactBuildError for roundId %p", (roundId) => {
            expect(() => buildRoundArtifact({roundId, provenance, stake: 1, steps: [losingResult()]})).toThrow(
                RoundArtifactBuildError,
            );
        });

        it("throws RoundArtifactBuildError for an empty betMode", () => {
            expect(() =>
                buildRoundArtifact({roundId: "r", provenance, betMode: "  ", stake: 1, steps: [losingResult()]}),
            ).toThrow(RoundArtifactBuildError);
        });

        it.each([-1, NaN, Infinity])("throws RoundArtifactBuildError for stake %p", (stake) => {
            expect(() => buildRoundArtifact({roundId: "r", provenance, stake, steps: [losingResult()]})).toThrow(
                RoundArtifactBuildError,
            );
        });

        it.each([0, -1, 1.5])("throws RoundArtifactBuildError for schemaVersion %p", (schemaVersion) => {
            expect(() =>
                buildRoundArtifact({roundId: "r", provenance, stake: 1, schemaVersion, steps: [losingResult()]}),
            ).toThrow(RoundArtifactBuildError);
        });

        it("throws RoundArtifactBuildError when round-level debug is not JSON-safe (cyclic)", () => {
            const cyclic: Record<string, unknown> = {};
            cyclic.self = cyclic;
            expect(() =>
                buildRoundArtifact({roundId: "r", provenance, stake: 1, steps: [losingResult()], debug: cyclic}),
            ).toThrow(RoundArtifactBuildError);
        });

        it("propagates a step's invalid win amount as RoundArtifactBuildError", () => {
            expect(() =>
                buildRoundArtifact({roundId: "r", provenance, stake: 1, steps: [resultWithWinAmount(NaN)]}),
            ).toThrow(RoundArtifactBuildError);
        });
    });

    describe("isolation and immutability", () => {
        it("is unaffected by mutating the caller's original step source after building", () => {
            const screen = [["A", "A", "A"]];
            const debug = {seed: "abc"};
            const source = {...losingResult(), screen, debug};

            const artifact = buildRoundArtifact({roundId: "r", provenance, stake: 1, steps: [source]});

            screen[0][0] = "MUTATED";
            debug.seed = "MUTATED";

            expect(artifact.screen).toEqual([["A", "A", "A"]]);
            expect(artifact.steps[0].debug).toEqual({seed: "abc"});
        });

        it("is unaffected by mutating the caller's original provenance object after building", () => {
            const ownProvenance = {...provenance, game: {...provenance.game}};
            const artifact = buildRoundArtifact({roundId: "r", provenance: ownProvenance, stake: 1, steps: [losingResult()]});

            ownProvenance.game.name = "mutated";

            expect(artifact.provenance.game.name).toBe("Crazy Fruits");
        });

        it("returns a deeply frozen artifact that throws on any attempted mutation", () => {
            const artifact = buildRoundArtifact({roundId: "r", provenance, stake: 1, steps: [winningResult()]});

            expect(() => {
                (artifact as {stake: number}).stake = 999;
            }).toThrow(TypeError);
            expect(() => {
                (artifact.wins as unknown[]).push({});
            }).toThrow(TypeError);
            expect(() => {
                (artifact.steps[0].wins[0].winningPositions[0] as number[])[0] = 999;
            }).toThrow(TypeError);
            expect(() => {
                (artifact.provenance.game as {name: string}).name = "mutated";
            }).toThrow(TypeError);
        });
    });
});
