import {RoundArtifact, StakeEngineRoundEventsProjector, ValueWinComponent, WinEvaluationResult, WinningValue, buildRoundArtifact} from "pokie";
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

    it("projects a single-step, no-win artifact to a reveal + finalWin sequence", () => {
        const events = projector.project(artifactWithNoWin());

        expect(events).toEqual([
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "finalWin", amount: 0, payoutMultiplier: 0},
        ]);
    });

    it("emits a win event per step that pays out, feature events passed through with their data spread, and one final finalWin", () => {
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

        const events = projector.project(artifact);

        expect(events).toEqual([
            {index: 0, type: "reveal", board: [["A"]]},
            {index: 1, type: "cascadeStep", step: 0},
            {index: 2, type: "win", amount: 5},
            {index: 3, type: "reveal", board: [["B"]]},
            {index: 4, type: "freeGamesTriggered", count: 10},
            {index: 5, type: "finalWin", amount: 5, payoutMultiplier: 5},
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

        const events = projector.project(artifact);

        expect(events[1].index).toBe(1);
        expect(events[1].type).toBe("custom");
    });
});
