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
    RoundArtifactValidator,
} from "@fromstan/pokie";

const provenance: RoundArtifactProvenance = {
    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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
