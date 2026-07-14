import {PreGeneratedRoundBuildError, buildPreGeneratedRoundResult, buildWeightedOutcomeLibrary, computeWeightedOutcomeLibraryHash} from "pokie";
import {artifactWith} from "../weightedoutcome/WeightedOutcomeTestFixtures";

function buildLibrary() {
    return buildWeightedOutcomeLibrary({
        libraryId: "build-test",
        outcomes: [
            {id: "no-win", weight: 70, artifact: artifactWith({roundId: "no-win", totalWin: 0})},
            {id: "small-win", weight: 25, artifact: artifactWith({roundId: "small-win", totalWin: 5})},
            {id: "jackpot", weight: 5, artifact: artifactWith({roundId: "jackpot", totalWin: 500})},
        ],
    });
}

describe("buildPreGeneratedRoundResult", () => {
    it("builds a result referencing the library's own outcome/artifact unmodified", () => {
        const library = buildLibrary();
        const libraryHash = computeWeightedOutcomeLibraryHash(library);
        const outcome = library.outcomes.find((candidate) => candidate.id === "jackpot")!;

        const result = buildPreGeneratedRoundResult({
            library,
            libraryHash,
            outcome,
            runtime: {
                roundId: "round-1",
                sessionId: "session-1",
                requestId: "req-1",
                balanceBefore: 100,
                balanceAfter: 599,
                transactions: [
                    {id: "round-1:debit", type: "debit", amount: 1},
                    {id: "round-1:credit", type: "credit", amount: 500},
                ],
            },
        });

        expect(result.artifact).toBe(outcome.artifact);
        expect(result.selection).toEqual({
            libraryId: "build-test",
            libraryHash,
            outcomeId: "jackpot",
            weight: 5,
            totalWeight: 100,
            probability: 0.05,
        });
        expect(result.runtime).toEqual({
            roundId: "round-1",
            sessionId: "session-1",
            requestId: "req-1",
            balanceBefore: 100,
            balanceAfter: 599,
            transactions: [
                {id: "round-1:debit", type: "debit", amount: 1},
                {id: "round-1:credit", type: "credit", amount: 500},
            ],
        });
    });

    it("omits requestId from runtime when none was given", () => {
        const library = buildLibrary();
        const libraryHash = computeWeightedOutcomeLibraryHash(library);
        const outcome = library.outcomes[0];

        const result = buildPreGeneratedRoundResult({
            library,
            libraryHash,
            outcome,
            runtime: {roundId: "round-1", sessionId: "session-1", balanceBefore: 100, balanceAfter: 99, transactions: []},
        });

        expect(result.runtime.requestId).toBeUndefined();
        expect("requestId" in result.runtime).toBe(false);
    });

    it("freezes the built result but the artifact stays the library's own already-frozen reference", () => {
        const library = buildLibrary();
        const outcome = library.outcomes[0];
        const result = buildPreGeneratedRoundResult({
            library,
            libraryHash: computeWeightedOutcomeLibraryHash(library),
            outcome,
            runtime: {roundId: "r", sessionId: "s", balanceBefore: 1, balanceAfter: 1, transactions: []},
        });

        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.selection)).toBe(true);
        expect(Object.isFrozen(result.artifact)).toBe(true);
        expect(result.artifact).toBe(outcome.artifact);
    });

    it("rejects an outcome whose artifact does not match the library's own entry for that id", () => {
        const library = buildLibrary();
        const foreignOutcome = {id: "no-win", weight: 70, artifact: artifactWith({roundId: "no-win", totalWin: 999})};

        expect(() =>
            buildPreGeneratedRoundResult({
                library,
                libraryHash: computeWeightedOutcomeLibraryHash(library),
                outcome: foreignOutcome,
                runtime: {roundId: "r", sessionId: "s", balanceBefore: 1, balanceAfter: 1, transactions: []},
            }),
        ).toThrow(PreGeneratedRoundBuildError);
    });

    it.each([
        ["", "session-1"],
        [undefined as unknown as string, "session-1"],
    ])("rejects an invalid roundId (%p)", (roundId, sessionId) => {
        const library = buildLibrary();
        expect(() =>
            buildPreGeneratedRoundResult({
                library,
                libraryHash: computeWeightedOutcomeLibraryHash(library),
                outcome: library.outcomes[0],
                runtime: {roundId, sessionId, balanceBefore: 1, balanceAfter: 1, transactions: []},
            }),
        ).toThrow(PreGeneratedRoundBuildError);
    });

    it("rejects a non-finite balance", () => {
        const library = buildLibrary();
        expect(() =>
            buildPreGeneratedRoundResult({
                library,
                libraryHash: computeWeightedOutcomeLibraryHash(library),
                outcome: library.outcomes[0],
                runtime: {roundId: "r", sessionId: "s", balanceBefore: NaN, balanceAfter: 1, transactions: []},
            }),
        ).toThrow(PreGeneratedRoundBuildError);
    });

    it("rejects a malformed transaction entry", () => {
        const library = buildLibrary();
        expect(() =>
            buildPreGeneratedRoundResult({
                library,
                libraryHash: computeWeightedOutcomeLibraryHash(library),
                outcome: library.outcomes[0],
                runtime: {
                    roundId: "r",
                    sessionId: "s",
                    balanceBefore: 1,
                    balanceAfter: 1,
                    transactions: [{id: "x", type: "deposit" as never, amount: 1}],
                },
            }),
        ).toThrow(PreGeneratedRoundBuildError);
    });
});
