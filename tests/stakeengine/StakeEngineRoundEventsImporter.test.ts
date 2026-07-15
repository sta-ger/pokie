import {
    RoundArtifact,
    StakeEngineEvent,
    StakeEngineImportEventsError,
    StakeEngineRoundEventsImporter,
    StakeEngineRoundEventsProjector,
    ValueWinComponent,
    WinEvaluationResult,
    WinningValue,
    buildRoundArtifact,
} from "pokie";
import {stakeEngineTestProvenance} from "./StakeEngineTestFixtures.js";

const projector = new StakeEngineRoundEventsProjector<string>();
const importer = new StakeEngineRoundEventsImporter<string>();

function eventsFor(artifact: RoundArtifact<string>, cost: number): readonly StakeEngineEvent[] {
    return projector.project(artifact, {cost});
}

function noWinArtifact(): RoundArtifact<string> {
    return buildRoundArtifact({
        roundId: "no-win",
        provenance: stakeEngineTestProvenance,
        betMode: "base",
        stake: 1,
        steps: [{screen: [["A"]], winEvaluationResult: new WinEvaluationResult<string>()}],
    });
}

// Both steps carry a nonzero win deliberately: a "win" event is what unambiguously closes a step's own
// feature-collecting window on import (a non-last step's window also closes on the *next* reveal regardless of
// win, but the *last* step has neither — see the disclosed limitation on StakeEngineRoundEventsImporter's own
// doc comment: a winless last step's trailing feature events are genuinely indistinguishable from round-level
// ones, since the event stream carries no explicit "this many features belong to this step" count).
function multiStepArtifact(): RoundArtifact<string> {
    return buildRoundArtifact({
        roundId: "multi-step",
        provenance: stakeEngineTestProvenance,
        betMode: "base",
        stake: 1,
        steps: [
            {
                screen: [["A"]],
                winEvaluationResult: new WinEvaluationResult<string>({
                    valueWins: [new ValueWinComponent<string>(new WinningValue<string>("A", [[0, 0]], 5))],
                }),
                featureEvents: [{type: "cascadeStep", data: {step: 0}}],
            },
            {
                screen: [["B"]],
                winEvaluationResult: new WinEvaluationResult<string>({
                    valueWins: [new ValueWinComponent<string>(new WinningValue<string>("B", [[0, 0]], 3))],
                }),
            },
        ],
        featureEvents: [{type: "freeGamesTriggered", data: {count: 10}}],
    });
}

function expectImportCode(fn: () => unknown, code: string): void {
    let thrown: unknown;
    try {
        fn();
    } catch (error) {
        thrown = error;
    }
    expect(thrown).toBeInstanceOf(StakeEngineImportEventsError);
    expect((thrown as StakeEngineImportEventsError).getCode()).toBe(code);
}

describe("StakeEngineRoundEventsImporter", () => {
    it("round-trips a single-step, no-win artifact exactly", () => {
        const artifact = noWinArtifact();
        const events = eventsFor(artifact, 1);

        const imported = importer.importEvents(events, {cost: 1, stake: artifact.stake});

        expect(imported).toEqual({
            steps: [{screen: [["A"]], totalWin: 0, featureEvents: []}],
            roundFeatureEvents: [],
            totalWin: 0,
            payoutMultiplier: 0,
        });
    });

    it("round-trips a multi-step artifact with step-level and round-level feature events exactly", () => {
        const artifact = multiStepArtifact();
        const events = eventsFor(artifact, 100);

        const imported = importer.importEvents(events, {cost: 100, stake: artifact.stake});

        expect(imported).toEqual({
            steps: [
                {screen: [["A"]], totalWin: 5, featureEvents: [{type: "cascadeStep", data: {step: 0}}]},
                {screen: [["B"]], totalWin: 3, featureEvents: []},
            ],
            roundFeatureEvents: [{type: "freeGamesTriggered", data: {count: 10}}],
            totalWin: 8,
            payoutMultiplier: 8,
        });
    });

    it("throws stakeengine-import-events-empty for an empty events array", () => {
        expectImportCode(() => importer.importEvents([], {cost: 1, stake: 1}), "stakeengine-import-events-empty");
    });

    it("throws stakeengine-import-events-index-out-of-sequence when an event's index doesn't match its position", () => {
        const events: StakeEngineEvent[] = [
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 5, type: "finalWin", amount: 0, payoutMultiplier: 0},
        ];
        expectImportCode(() => importer.importEvents(events, {cost: 1, stake: 1}), "stakeengine-import-events-index-out-of-sequence");
    });

    it("throws stakeengine-import-events-missing-reveal when the first event isn't reveal", () => {
        const events: StakeEngineEvent[] = [{index: 0, type: "finalWin", amount: 0, payoutMultiplier: 0}];
        expectImportCode(() => importer.importEvents(events, {cost: 1, stake: 1}), "stakeengine-import-events-missing-reveal");
    });

    it("throws stakeengine-import-events-reveal-shape-invalid for an extra key or an invalid board", () => {
        const extraKey: StakeEngineEvent[] = [
            {index: 0, type: "reveal", board: [["A"]], bogus: true},
            {index: 1, type: "finalWin", amount: 0, payoutMultiplier: 0},
        ];
        expectImportCode(() => importer.importEvents(extraKey, {cost: 1, stake: 1}), "stakeengine-import-events-reveal-shape-invalid");

        const emptyBoard: StakeEngineEvent[] = [
            {index: 0, type: "reveal", board: []},
            {index: 1, type: "finalWin", amount: 0, payoutMultiplier: 0},
        ];
        expectImportCode(() => importer.importEvents(emptyBoard, {cost: 1, stake: 1}), "stakeengine-import-events-reveal-shape-invalid");
    });

    it("throws stakeengine-import-events-unexpected-win for two consecutive win events", () => {
        const events: StakeEngineEvent[] = [
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "win", amount: 100},
            {index: 2, type: "win", amount: 100},
            {index: 3, type: "finalWin", amount: 200, payoutMultiplier: 200},
        ];
        expectImportCode(() => importer.importEvents(events, {cost: 1, stake: 1}), "stakeengine-import-events-unexpected-win");
    });

    it("throws stakeengine-import-events-win-shape-invalid for an extra key or a non-integer amount", () => {
        const extraKey: StakeEngineEvent[] = [
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "win", amount: 100, bogus: true},
            {index: 2, type: "finalWin", amount: 100, payoutMultiplier: 100},
        ];
        expectImportCode(() => importer.importEvents(extraKey, {cost: 1, stake: 1}), "stakeengine-import-events-win-shape-invalid");

        const badAmount: StakeEngineEvent[] = [
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "win", amount: -5},
            {index: 2, type: "finalWin", amount: 100, payoutMultiplier: 100},
        ];
        expectImportCode(() => importer.importEvents(badAmount, {cost: 1, stake: 1}), "stakeengine-import-events-win-shape-invalid");
    });

    it("throws stakeengine-import-win-amount-not-invertible when a win amount can't be reversed without hidden rounding", () => {
        // Empirically confirmed: stakeUnits=1 at cost=3 doesn't reverse to an exact ratio.
        const events: StakeEngineEvent[] = [
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "win", amount: 1},
            {index: 2, type: "finalWin", amount: 1, payoutMultiplier: 1},
        ];
        expectImportCode(() => importer.importEvents(events, {cost: 3, stake: 1}), "stakeengine-import-win-amount-not-invertible");
    });

    it("throws stakeengine-import-events-missing-final-win when the last event isn't finalWin", () => {
        const events: StakeEngineEvent[] = [{index: 0, type: "reveal", board: [["A"]]}];
        expectImportCode(() => importer.importEvents(events, {cost: 1, stake: 1}), "stakeengine-import-events-missing-final-win");
    });

    it("throws stakeengine-import-events-final-win-not-last when a finalWin-typed event isn't the last one", () => {
        const events: StakeEngineEvent[] = [
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "finalWin", amount: 0, payoutMultiplier: 0},
            {index: 2, type: "reveal", board: [["B"]]},
        ];
        expectImportCode(() => importer.importEvents(events, {cost: 1, stake: 1}), "stakeengine-import-events-final-win-not-last");
    });

    it("throws stakeengine-import-events-final-win-shape-invalid for an extra key or a non-integer amount/payoutMultiplier", () => {
        const extraKey: StakeEngineEvent[] = [
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "finalWin", amount: 0, payoutMultiplier: 0, bogus: true},
        ];
        expectImportCode(() => importer.importEvents(extraKey, {cost: 1, stake: 1}), "stakeengine-import-events-final-win-shape-invalid");

        const badAmount: StakeEngineEvent[] = [
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "finalWin", amount: 1.5, payoutMultiplier: 0},
        ];
        expectImportCode(() => importer.importEvents(badAmount, {cost: 1, stake: 1}), "stakeengine-import-events-final-win-shape-invalid");
    });

    it("throws stakeengine-import-final-win-amount-payout-multiplier-mismatch when finalWin's amount and payoutMultiplier differ", () => {
        const events: StakeEngineEvent[] = [
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "finalWin", amount: 100, payoutMultiplier: 200},
        ];
        expectImportCode(() => importer.importEvents(events, {cost: 1, stake: 1}), "stakeengine-import-final-win-amount-payout-multiplier-mismatch");
    });

    it("throws stakeengine-import-payout-multiplier-not-invertible when finalWin's value can't be reversed without hidden rounding", () => {
        const events: StakeEngineEvent[] = [
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "finalWin", amount: 1, payoutMultiplier: 1},
        ];
        expectImportCode(() => importer.importEvents(events, {cost: 3, stake: 1}), "stakeengine-import-payout-multiplier-not-invertible");
    });

    it("throws stakeengine-import-total-win-mismatch when the steps' totalWin doesn't sum to finalWin's own amount", () => {
        const events: StakeEngineEvent[] = [
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "win", amount: 100},
            {index: 2, type: "finalWin", amount: 999, payoutMultiplier: 999},
        ];
        expectImportCode(() => importer.importEvents(events, {cost: 1, stake: 1}), "stakeengine-import-total-win-mismatch");
    });

    it("safely reconstructs a feature event's data field literally named \"__proto__\" as a real own property, never as a prototype reassignment", () => {
        const protoKey = "__proto__";
        // JSON.parse (exactly how a real books.jsonl line is read — see StakeEngineImporter's own readBooksFile)
        // uses CreateDataProperty internally, so this really does produce an event with an *own* property named
        // "__proto__" (a plain JS object literal with a "__proto__" key would instead set the object's own
        // prototype — this is why the raw JSONL text is parsed here rather than written as a TS object literal).
        const events = JSON.parse(
            `[{"index":0,"type":"reveal","board":[["A"]]},` +
                `{"index":1,"type":"customFeature",${JSON.stringify(protoKey)}:{"polluted":true}},` +
                `{"index":2,"type":"finalWin","amount":0,"payoutMultiplier":0}]`,
        ) as StakeEngineEvent[];

        const imported = importer.importEvents(events, {cost: 1, stake: 1});

        const featureEvent = imported.steps[0].featureEvents[0];
        expect(featureEvent.type).toBe("customFeature");
        const data = featureEvent.data as Record<string, unknown>;
        expect(Reflect.getPrototypeOf(data)).toBeNull();
        expect(Reflect.apply(Object.prototype.hasOwnProperty, data, [protoKey])).toBe(true);
        expect(data[protoKey]).toEqual({polluted: true});
    });
});
