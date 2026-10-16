import {
    PublicRoundArtifactProjector, projectPublicFeatureEvent, VideoSlotSession, SymbolsSequence, Paytable,
    RoundArtifactProvenance,
    SymbolsCombination,
    VideoSlotConfig,
    VideoSlotSessionHandling,
    VideoSlotWinCalculator,
    WinEvaluationResult,
    buildRoundArtifactFromSession,
    CascadeResult,
    CascadeStep,
    RoundArtifactValidator, ResizableSymbolsCombinationsGenerator, VariableHeightSymbolsCombinationsGenerator,
    CustomLinesDefinitions, SeededRandomNumberGenerator, PokieJsonRoundArtifactProjector,
    projectPublicRoundStep, buildRoundStepArtifact, WinComponent,
    type RoundArtifactWin,

} from "@fromstan/pokie";

const provenance: RoundArtifactProvenance = {
    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    pokieVersion: "1.3.0",
};

function sampleScreen(): string[][] {
    return [["A", "A", "A"], ["A", "K", "Q"], ["A", "K", "Q"], ["K", "Q", "J"], ["Q", "J", "10"]];
}

function winEvaluationResultWithWin(): WinEvaluationResult<string> {
    const config = new VideoSlotConfig();
    const winCalculator = new VideoSlotWinCalculator(config);
    const symbols = new SymbolsCombination<string>().fromMatrix(sampleScreen());
    winCalculator.calculateWin(config.getAvailableBets()[0], symbols);
    return winCalculator.getWinEvaluationResult();
}

// A narrow fake covering only what buildRoundArtifactFromSession actually calls, cast to
// VideoSlotSessionHandling<string> the same way the codebase's own feature-detection helpers
// (determineStakeAmount, StakeBasedSimulationRoundCategoryDeterminer) narrow a session to an optional
// interface — not a full VideoSlotSessionHandling implementation.
function fakeSession(overrides: Record<string, unknown> = {}): VideoSlotSessionHandling<string> {
    const screen = sampleScreen();
    return {
        getBet: () => 5,
        getSymbolsCombination: () => ({toMatrix: () => screen}),
        getWinEvaluationResult: () => winEvaluationResultWithWin(),
        ...overrides,
    } as unknown as VideoSlotSessionHandling<string>;
}

describe("buildRoundArtifactFromSession", () => {
    it.each(["terminal-only", "multi-step", "bounded-exhaustion"])("retains weighted selection evidence on every %s cascade artifact source", kind => {
        const screen = [["A"]],
            evaluation = new WinEvaluationResult<string>();
        const steps = kind === "terminal-only" ? [] : [new CascadeStep(screen, evaluation, [], []), new CascadeStep(screen, evaluation, [], [])];
        const selection = [{reelIndex: 0, variantId: "all-A", context: "logical:cascade"}];
        const session = fakeSession({getSequenceSelections: () => selection, getCascadeResult: () => new CascadeResult(screen, screen, steps, {}, {}, {}, kind === "bounded-exhaustion" ? undefined : evaluation)});
        const artifact = buildRoundArtifactFromSession(session, {roundId: "cascade", provenance});
        expect(artifact.sequenceSelections).toEqual(selection);
        expect(artifact.steps).toHaveLength(steps.length + (kind === "bounded-exhaustion" ? 0 : 1));
        artifact.steps.forEach(step => expect(step.sequenceSelections).toEqual(selection));
        expect(new RoundArtifactValidator().validate(artifact)).toEqual([]);
    });
    it("uses the session's own bet as stake when it does not implement StakeAmountDetermining", () => {
        const artifact = buildRoundArtifactFromSession(fakeSession(), {roundId: "r1", provenance});

        expect(artifact.stake).toBe(5);
        expect(artifact.betMode).toBe("base");
        expect(artifact.screen).toEqual(sampleScreen());
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


it("preserves a negative numeric sticky symbol through canonical and public session artifacts", () => {
    const config = new VideoSlotConfig<number>();
    config.setReelsNumber(3);
    config.setReelsSymbolsNumber(1);
    config.setAvailableSymbols([1, -1]);
    config.setWildSymbols([-1]);
    config.setScatterSymbols([]);
    const paytable = new Paytable<number>(config.getAvailableBets());
    paytable.setPayoutForSymbol(1, 3, 10);
    config.setPaytable(paytable);
    config.setSymbolsSequences([[1], [-1], [1]].map(strip => new SymbolsSequence<number>().fromArray(strip)));
    config.setScreenModifiers({wilds: [{symbol: -1, factor: 2}], rules: [{id: "negative", type: "sticky", symbol: -1, space: "evaluated", positions: [[1, 0]], lifetime: 3}]});
    const session = new VideoSlotSession(config);
    session.play();
    const artifact = buildRoundArtifactFromSession(session, {roundId: "negative", provenance});
    expect(new RoundArtifactValidator<number>().validate(artifact)).toEqual([]);
    const projected = new PublicRoundArtifactProjector<number>().project(artifact);
    const event = {type: "screenModifiers", data: {space: "evaluated", rules: [{id: "negative", positions: [[1, 0]]}], sticky: [{ruleId: "negative", position: [1, 0], symbol: -1, factor: 2, remaining: 2}]}};
    expect(projected.featureEvents).toEqual([event]);
    expect(projected.steps[0].featureEvents).toEqual([event]);
    expect(projected.totalWin).toBe(artifact.totalWin);
});

it.each([null, {}, [], NaN, Infinity, -Infinity])("public projection rejects malformed/nonfinite sticky identity %p", symbol => {
    const cell = {ruleId: "r", position: [0, 0], symbol, factor: 0, remaining: 1};
    const event = projectPublicFeatureEvent({type: "screenModifiers", data: {sticky: [cell]}});
    expect(event.data?.sticky).toEqual([]);
});


it.each(["resizable", "variable"])("captures and publicly projects real %s reel heights [1,2,3] without geometry", kind => {
    const config = new VideoSlotConfig();
    config.setReelsNumber(3);
    config.setReelsSymbolsNumber(1);
    config.setAvailableSymbols(["A"]);
    config.setScatterSymbols([]);
    config.setWildSymbols([]);
    config.setAvailableBets([1]);
    config.setSymbolsSequences([0, 1, 2].map(() => new SymbolsSequence().fromArray(["A"])));
    config.setLinesDefinitions(new CustomLinesDefinitions().fromMap({"0": [0, 0, 0]}));
    const paytable = new Paytable<string>([1]);
    paytable.setPayoutForSymbol("A", 3, 2);
    config.setPaytable(paytable);
    const rng = new SeededRandomNumberGenerator("jagged");
    const generator = kind === "resizable" ? new ResizableSymbolsCombinationsGenerator(config, [1, 2, 3], rng)
        : new VariableHeightSymbolsCombinationsGenerator(config, [1, 2, 3].map(height => new SymbolsSequence<number>().fromArray([height])), rng);
    const session = new VideoSlotSession(config, generator);
    session.play();
    const artifact = buildRoundArtifactFromSession(session, {roundId: "jagged", provenance});
    const screen = [["A"], ["A", "A"], ["A", "A", "A"]];
    expect(session.getWinAmount()).toBe(2);
    expect(artifact.screen).toEqual(screen);
    expect(artifact.geometry).toBeUndefined();
    expect(artifact.totalWin).toBe(2);
    const validator = new RoundArtifactValidator();
    const projector = new PublicRoundArtifactProjector();
    expect(validator.validate(artifact)).toEqual([]);
    expect(projector.project(artifact)).toMatchObject({screen, totalWin: 2, wins: [{winningPositions: [[0, 0], [1, 0], [2, 0]]}]});
    expect(new PokieJsonRoundArtifactProjector().project(artifact).screen).toEqual(screen);
    // All actual reel cells are valid, including rows beyond the first reel's height.
    const original = artifact.wins[0];
    const high: RoundArtifactWin = {...original, winningPositions: [[0, 0], [1, 1], [2, 2]], metadata: {...original.metadata, definition: [0, 1, 2]},
        multiplierBreakdown: [{source: "custom", positions: [[1, 1], [2, 2]], values: [1], combinedMultiplier: 1}]};
    class ArtifactComponent extends WinComponent<string> {
        constructor(win: RoundArtifactWin) {
            super(win.type, win.id, String(win.symbolId), win.winAmount, win.winningPositions.map(position => [...position]),
                win.multiplierBreakdown.map(item => ({...item, positions: item.positions.map(position => [...position]), values: [...item.values]})), win.metadata);
        }
    }
    const evaluation = (win: RoundArtifactWin) => new WinEvaluationResult({winComponents: [new ArtifactComponent(win)]});
    const build = (win: RoundArtifactWin) => buildRoundStepArtifact(0, {screen, winEvaluationResult: evaluation(win)});
    expect(build(high).wins[0]).toEqual(high);
    for (const [reel, row] of [[0, 1], [1, 2], [2, 3], [3, 0], [-1, 0], [1, 0.5]]) {
        for (const win of [
            {...high, winningPositions: [[reel, row]]},
            {...high, multiplierBreakdown: [{...high.multiplierBreakdown[0], positions: [[reel, row]]}]},
            {...high, metadata: {...high.metadata, definition: reel < 0 ? [-1, 1, 2] : Array.from({length: Math.max(3, reel + 1)}, (_, index) => index === reel ? row : index)}},
        ]) {
            expect(() => build(win)).toThrow(/outside evaluation domain/);
            const step = {...artifact.steps[0], wins: [win]};
            const malformed = {...artifact, wins: [win], steps: [step]};
            expect(validator.validate(malformed)).toContainEqual(expect.objectContaining({code: "round-artifact-coordinates-invalid", message: expect.stringMatching(/outside evaluation domain/)}));
            expect(() => projectPublicRoundStep(step)).toThrow(/outside evaluation domain/);
            expect(() => projector.project(malformed)).toThrow(/outside evaluation domain/);
            for (let retry = 0; retry < 2; retry++) {
                expect(validator.validate(artifact)).toEqual([]);
                expect(projector.project(artifact).screen).toEqual(screen);
            }
        }
    }
    // A generic custom event remains supported independently of portable canonical events.
    const custom = buildRoundStepArtifact(0, {screen, winEvaluationResult: evaluation(high), featureEvents: [{type: "foreignFeature", data: {count: 2}}]});
    expect(projectPublicRoundStep(custom).featureEvents).toEqual([{type: "foreignFeature", data: {count: 2}}]);
    const customArtifact = {...artifact, steps: [custom], wins: custom.wins, featureEvents: custom.featureEvents};
    expect(validator.validate(customArtifact)).toEqual([]);
    expect(new PokieJsonRoundArtifactProjector().project(customArtifact).featureEvents).toEqual(custom.featureEvents);
});
