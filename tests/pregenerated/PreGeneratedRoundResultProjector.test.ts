import {
    PreGeneratedRoundResultProjector,
    buildPreGeneratedRoundResult,
    buildWeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
    VideoSlotSession, SymbolsCombination, buildRoundArtifactFromSession,
} from "@fromstan/pokie";
import {adversarialScreen, overscanConfig, overscanGeometry, overscanBlueprint} from "../v2/fixtures/OverscanGame.js";
import {artifactWith} from "../weightedoutcome/WeightedOutcomeTestFixtures.js";

describe("PreGeneratedRoundResultProjector", () => {
    const library = buildWeightedOutcomeLibrary({
        libraryId: "projector-test",
        outcomes: [{id: "jackpot", weight: 1, artifact: artifactWith({roundId: "jackpot", totalWin: 50})}],
    });
    const libraryHash = computeWeightedOutcomeLibraryHash(library);
    const outcome = library.outcomes[0];
    const result = buildPreGeneratedRoundResult({
        expectedLibraryId: library.libraryId,
        expectedLibraryHash: libraryHash,
        selection: {libraryId: library.libraryId, libraryHash, totalWeight: 1, outcome},
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
            expectedLibraryId: library.libraryId,
            expectedLibraryHash: libraryHash,
            selection: {libraryId: library.libraryId, libraryHash, totalWeight: 1, outcome},
            runtime: {roundId: "round-2", sessionId: "session-1", balanceBefore: 100, balanceAfter: 149, transactions: []},
        });

        const publicView = projector.projectPublic(noRequestIdResult);
        expect("requestId" in publicView).toBe(false);
    });

    it("F6 retains fractional coverage and visible highlights through the flattened public response", () => {
        const config = overscanConfig();
        const geometry = {...overscanGeometry, visible: {rowOffset: 1.25, rows: 2.5}};
        config.setScreenGeometry(geometry);
        const session = new VideoSlotSession(config, {generateSymbolsCombination: () => new SymbolsCombination().fromMatrix(adversarialScreen()).withCoordinates(geometry)});
        session.play();
        const artifact = buildRoundArtifactFromSession(session, {roundId: "fractional", provenance: {game: overscanBlueprint.manifest, pokieVersion: "1.3.0"}});
        const fractionalLibrary = buildWeightedOutcomeLibrary({libraryId: "fractional", outcomes: [{id: "one", weight: 1, artifact}]});
        const fractionalHash = computeWeightedOutcomeLibraryHash(fractionalLibrary);
        const fractionalResult = buildPreGeneratedRoundResult({
            expectedLibraryId: fractionalLibrary.libraryId, expectedLibraryHash: fractionalHash,
            selection: {libraryId: fractionalLibrary.libraryId, libraryHash: fractionalHash, totalWeight: 1, outcome: fractionalLibrary.outcomes[0]},
            runtime: {roundId: "round", sessionId: "session", balanceBefore: 100, balanceAfter: 102, transactions: [{id: "d", type: "debit", amount: 1}, {id: "c", type: "credit", amount: 3}]},
        });
        const publicView = projector.projectPublic(fractionalResult);
        expect(publicView.visibleRowCoverage).toEqual([0.75, 1, 0.75]);
        expect(publicView.screen[0]).toEqual(["W", "B", "B"]);
        expect(publicView.wins[0].winningPositions[0]).toEqual([0, 1]);
        expect(JSON.stringify(publicView)).not.toMatch(/generatedScreen|geometry|debug/);
        expect(projector.projectInternal(fractionalResult).artifact.geometry).toEqual(geometry);
    });

    it("projects the full audit trail as the internal view", () => {
        const internalView = projector.projectInternal(result);

        expect(internalView.selection).toEqual(result.selection);
        expect(internalView.runtime).toEqual(result.runtime);
        expect(internalView.artifact).toBe(result.artifact);
    });
});
