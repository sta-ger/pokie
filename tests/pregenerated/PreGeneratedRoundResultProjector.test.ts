import {
    PreGeneratedRoundResultProjector,
    buildPreGeneratedRoundResult,
    buildWeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
} from "pokie";
import {artifactWith} from "../weightedoutcome/WeightedOutcomeTestFixtures.js";

describe("PreGeneratedRoundResultProjector", () => {
    const library = buildWeightedOutcomeLibrary({
        libraryId: "projector-test",
        outcomes: [{id: "jackpot", weight: 1, artifact: artifactWith({roundId: "jackpot", totalWin: 50})}],
    });
    const libraryHash = computeWeightedOutcomeLibraryHash(library);
    const outcome = library.outcomes[0];
    const result = buildPreGeneratedRoundResult({
        library,
        libraryHash,
        outcome,
        runtime: {
            roundId: "round-1",
            sessionId: "session-1",
            requestId: "req-1",
            balanceBefore: 100,
            balanceAfter: 149,
            transactions: [
                {id: "round-1:debit", type: "debit", amount: 1},
                {id: "round-1:credit", type: "credit", amount: 50},
            ],
        },
    });
    const projector = new PreGeneratedRoundResultProjector<string>();

    it("projects a client-safe public view with no library/outcome/weight provenance", () => {
        const publicView = projector.projectPublic(result);

        expect(publicView).toEqual({
            roundId: "round-1",
            sessionId: "session-1",
            requestId: "req-1",
            credits: 149,
            win: 50,
            payoutMultiplier: 50,
            screen: outcome.artifact.screen,
            wins: outcome.artifact.wins,
        });
        expect(publicView).not.toHaveProperty("selection");
        expect(publicView).not.toHaveProperty("runtime");
    });

    it("omits requestId from the public view when the round had none", () => {
        const noRequestIdResult = buildPreGeneratedRoundResult({
            library,
            libraryHash,
            outcome,
            runtime: {roundId: "round-2", sessionId: "session-1", balanceBefore: 100, balanceAfter: 149, transactions: []},
        });

        const publicView = projector.projectPublic(noRequestIdResult);
        expect("requestId" in publicView).toBe(false);
    });

    it("projects the full audit trail as the internal view", () => {
        const internalView = projector.projectInternal(result);

        expect(internalView.selection).toEqual(result.selection);
        expect(internalView.runtime).toEqual(result.runtime);
        expect(internalView.artifact).toBe(result.artifact);
    });
});
