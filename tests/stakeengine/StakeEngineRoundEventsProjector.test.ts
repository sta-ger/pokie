import {
    RoundArtifact,
    StakeEngineRoundEventsImporter,
    StakeEngineRoundEventsProjector,
    ValueWinComponent,
    WinEvaluationResult,
    WinningValue,
    buildRoundArtifact,
} from "pokie";
import {stakeEngineTestProvenance} from "./StakeEngineTestFixtures.js";

function artifactWithNoWin(): RoundArtifact<string> {
    return buildRoundArtifact({
        roundId: "no-win",
        provenance: stakeEngineTestProvenance,
        betMode: "base",
        stake: 1,
        steps: [{screen: [["A"]], winEvaluationResult: new WinEvaluationResult<string>()}],
    });
}

describe("StakeEngineRoundEventsProjector", () => {
    const projector = new StakeEngineRoundEventsProjector<string>();

    it("projects a single-step, no-win artifact to a reveal + finalWin sequence, with cost folded into finalWin", () => {
        const events = projector.project(artifactWithNoWin(), {cost: 1});

        expect(events).toEqual([
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "finalWin", amount: 0, payoutMultiplier: 0},
        ]);
    });

    it("converts win/finalWin amounts and the finalWin payoutMultiplier into Stake units (ratio * cost * 100)", () => {
        const artifact = buildRoundArtifact({
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
                {screen: [["B"]], winEvaluationResult: new WinEvaluationResult<string>()},
            ],
            featureEvents: [{type: "freeGamesTriggered", data: {count: 10}}],
        });

        const events = projector.project(artifact, {cost: 100});

        // stake 1, totalWin 5 -> payoutMultiplier 5; at cost 100: (5/1)*100*100 = 50000 for both the step win
        // and the final amount/payoutMultiplier — they're the same ratio, so they always agree exactly.
        expect(events).toEqual([
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "cascadeStep", step: 0},
            {index: 2, type: "win", amount: 50000},
            {index: 3, type: "reveal", board: [["B"]]},
            {index: 4, type: "freeGamesTriggered", count: 10},
            {index: 5, type: "finalWin", amount: 50000, payoutMultiplier: 50000},
        ]);
    });

    it("stamps the true position last, overriding a colliding \"index\" key a passed-through feature event's data happens to carry", () => {
        const artifact = buildRoundArtifact({
            roundId: "index-collision",
            provenance: stakeEngineTestProvenance,
            betMode: "base",
            stake: 1,
            steps: [
                {
                    screen: [["A"]],
                    winEvaluationResult: new WinEvaluationResult<string>(),
                    featureEvents: [{type: "custom", data: {index: 999}}],
                },
            ],
        });

        const events = projector.project(artifact, {cost: 1});

        expect(events[1].index).toBe(1);
        expect(events[1].type).toBe("custom");
    });

    it("throws when a win amount is not representable as a non-negative safe integer once converted to Stake units", () => {
        const artifact = buildRoundArtifact({
            roundId: "unrepresentable",
            provenance: stakeEngineTestProvenance,
            betMode: "base",
            stake: 1,
            steps: [
                {
                    screen: [["A"]],
                    winEvaluationResult: new WinEvaluationResult<string>({
                        valueWins: [new ValueWinComponent<string>(new WinningValue<string>("A", [[0, 0]], 0.001))],
                    }),
                },
            ],
        });

        // (0.001 / 1) * 1 * 100 = 0.1 — not a safe integer.
        expect(() => projector.project(artifact, {cost: 1})).toThrow(/not representable as a non-negative safe integer/);
    });

    describe.each(["reveal", "win", "finalWin"])('reserved featureEvent type "%s"', (reservedType) => {
        it("is rejected by the projector rather than silently emitted", () => {
            const artifact = buildRoundArtifact({
                roundId: "reserved-type",
                provenance: stakeEngineTestProvenance,
                betMode: "base",
                stake: 1,
                steps: [
                    {
                        screen: [["A"]],
                        winEvaluationResult: new WinEvaluationResult<string>(),
                        featureEvents: [{type: reservedType, data: {sneaky: true}}],
                    },
                ],
            });

            expect(() => projector.project(artifact, {cost: 1})).toThrow(/reserved/);
        });

        it("round-trips cleanly once renamed to a non-reserved type (confirms the rejection is specific to the reserved word, not the data shape)", () => {
            const artifact = buildRoundArtifact({
                roundId: "renamed-type",
                provenance: stakeEngineTestProvenance,
                betMode: "base",
                stake: 1,
                steps: [
                    {
                        screen: [["A"]],
                        winEvaluationResult: new WinEvaluationResult<string>(),
                        featureEvents: [{type: `custom-${reservedType}`, data: {sneaky: true}}],
                    },
                ],
            });

            const events = projector.project(artifact, {cost: 1});
            const imported = new StakeEngineRoundEventsImporter<string>().importEvents(events, {cost: 1, stake: 1});

            expect(imported.steps[0].featureEvents).toEqual([{type: `custom-${reservedType}`, data: {sneaky: true}}]);
        });
    });
});
