import {PreGeneratedOutcomeSelection, PreGeneratedRoundBuildError, buildPreGeneratedRoundResult, buildWeightedOutcomeLibrary, computeWeightedOutcomeLibraryHash} from "pokie";
import {artifactWith} from "../weightedoutcome/WeightedOutcomeTestFixtures.js";

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
    it("builds a result referencing the selection's own outcome/artifact unmodified", () => {
        const library = buildLibrary();
        const libraryHash = computeWeightedOutcomeLibraryHash(library);
        const outcome = library.outcomes.find((candidate) => candidate.id === "jackpot")!;
        const selection: PreGeneratedOutcomeSelection<string> = {libraryId: library.libraryId, libraryHash, totalWeight: 100, outcome};

        const result = buildPreGeneratedRoundResult({
            expectedLibraryId: library.libraryId,
            expectedLibraryHash: libraryHash,
            selection,
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
            expectedLibraryId: library.libraryId,
            expectedLibraryHash: libraryHash,
            selection: {libraryId: library.libraryId, libraryHash, totalWeight: 100, outcome},
            runtime: {roundId: "round-1", sessionId: "session-1", balanceBefore: 100, balanceAfter: 99, transactions: []},
        });

        expect(result.runtime.requestId).toBeUndefined();
        expect("requestId" in result.runtime).toBe(false);
    });

    it("freezes the built result but the artifact stays the selection's own already-frozen reference", () => {
        const library = buildLibrary();
        const outcome = library.outcomes[0];
        const libraryHash = computeWeightedOutcomeLibraryHash(library);
        const result = buildPreGeneratedRoundResult({
            expectedLibraryId: library.libraryId,
            expectedLibraryHash: libraryHash,
            selection: {libraryId: library.libraryId, libraryHash, totalWeight: 100, outcome},
            runtime: {roundId: "r", sessionId: "s", balanceBefore: 1, balanceAfter: 1, transactions: []},
        });

        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.selection)).toBe(true);
        expect(Object.isFrozen(result.artifact)).toBe(true);
        expect(result.artifact).toBe(outcome.artifact);
    });

    it("rejects a selection whose libraryId doesn't match the caller's expected identity", () => {
        const library = buildLibrary();
        const libraryHash = computeWeightedOutcomeLibraryHash(library);

        expect(() =>
            buildPreGeneratedRoundResult({
                expectedLibraryId: "some-other-library",
                expectedLibraryHash: libraryHash,
                selection: {libraryId: library.libraryId, libraryHash, totalWeight: 100, outcome: library.outcomes[0]},
                runtime: {roundId: "r", sessionId: "s", balanceBefore: 1, balanceAfter: 1, transactions: []},
            }),
        ).toThrow(PreGeneratedRoundBuildError);
    });

    it("rejects a selection whose libraryHash doesn't match the caller's expected identity — e.g. a session stamped against a library since regenerated with different weights under the same libraryId", () => {
        const before = buildLibrary();
        const staleHash = computeWeightedOutcomeLibraryHash(before);

        const after = buildWeightedOutcomeLibrary({
            libraryId: "build-test",
            outcomes: [
                {id: "no-win", weight: 60, artifact: artifactWith({roundId: "no-win", totalWin: 0})},
                {id: "small-win", weight: 30, artifact: artifactWith({roundId: "small-win", totalWin: 5})},
                {id: "jackpot", weight: 10, artifact: artifactWith({roundId: "jackpot", totalWin: 500})},
            ],
        });
        const afterHash = computeWeightedOutcomeLibraryHash(after);

        expect(() =>
            buildPreGeneratedRoundResult({
                expectedLibraryId: after.libraryId,
                expectedLibraryHash: staleHash,
                selection: {libraryId: after.libraryId, libraryHash: afterHash, totalWeight: 100, outcome: after.outcomes[0]},
                runtime: {roundId: "r", sessionId: "s", balanceBefore: 1, balanceAfter: 1, transactions: []},
            }),
        ).toThrow(PreGeneratedRoundBuildError);
    });

    it.each([
        ["", "session-1"],
        [undefined as unknown as string, "session-1"],
    ])("rejects an invalid roundId (%p)", (roundId, sessionId) => {
        const library = buildLibrary();
        const libraryHash = computeWeightedOutcomeLibraryHash(library);
        expect(() =>
            buildPreGeneratedRoundResult({
                expectedLibraryId: library.libraryId,
                expectedLibraryHash: libraryHash,
                selection: {libraryId: library.libraryId, libraryHash, totalWeight: 100, outcome: library.outcomes[0]},
                runtime: {roundId, sessionId, balanceBefore: 1, balanceAfter: 1, transactions: []},
            }),
        ).toThrow(PreGeneratedRoundBuildError);
    });

    it("rejects a non-finite balance", () => {
        const library = buildLibrary();
        const libraryHash = computeWeightedOutcomeLibraryHash(library);
        expect(() =>
            buildPreGeneratedRoundResult({
                expectedLibraryId: library.libraryId,
                expectedLibraryHash: libraryHash,
                selection: {libraryId: library.libraryId, libraryHash, totalWeight: 100, outcome: library.outcomes[0]},
                runtime: {roundId: "r", sessionId: "s", balanceBefore: NaN, balanceAfter: 1, transactions: []},
            }),
        ).toThrow(PreGeneratedRoundBuildError);
    });

    it("rejects a malformed transaction entry", () => {
        const library = buildLibrary();
        const libraryHash = computeWeightedOutcomeLibraryHash(library);
        expect(() =>
            buildPreGeneratedRoundResult({
                expectedLibraryId: library.libraryId,
                expectedLibraryHash: libraryHash,
                selection: {libraryId: library.libraryId, libraryHash, totalWeight: 100, outcome: library.outcomes[0]},
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

    it("rejects a fractional selection.outcome.weight, even though buildWeightedOutcomeLibrary itself allows one", () => {
        // buildWeightedOutcomeLibrary only requires a finite weight > 0 (exact statistical analysis
        // works over ratios) — buildPreGeneratedRoundResult is stricter, since a draw needs an integer
        // weight to be exactly unbiased (see WeightedOutcomeSelector's own doc comment).
        const library = buildWeightedOutcomeLibrary({
            libraryId: "fractional-weight",
            outcomes: [{id: "only", weight: 0.5, artifact: artifactWith({roundId: "only", totalWin: 0})}],
        });
        const libraryHash = computeWeightedOutcomeLibraryHash(library);

        expect(() =>
            buildPreGeneratedRoundResult({
                expectedLibraryId: library.libraryId,
                expectedLibraryHash: libraryHash,
                selection: {libraryId: library.libraryId, libraryHash, totalWeight: 0.5, outcome: library.outcomes[0]},
                runtime: {roundId: "r", sessionId: "s", balanceBefore: 1, balanceAfter: 1, transactions: []},
            }),
        ).toThrow(PreGeneratedRoundBuildError);
    });

    it("rejects a selection.outcome.weight that exceeds Number.MAX_SAFE_INTEGER", () => {
        const library = buildWeightedOutcomeLibrary({
            libraryId: "unsafe-weight",
            outcomes: [{id: "only", weight: 2 ** 60, artifact: artifactWith({roundId: "only", totalWin: 0})}],
        });
        const libraryHash = computeWeightedOutcomeLibraryHash(library);

        expect(() =>
            buildPreGeneratedRoundResult({
                expectedLibraryId: library.libraryId,
                expectedLibraryHash: libraryHash,
                selection: {libraryId: library.libraryId, libraryHash, totalWeight: 2 ** 60, outcome: library.outcomes[0]},
                runtime: {roundId: "r", sessionId: "s", balanceBefore: 1, balanceAfter: 1, transactions: []},
            }),
        ).toThrow(PreGeneratedRoundBuildError);
    });

    it("rejects a fractional selection.totalWeight even though outcome.weight itself is a positive safe integer", () => {
        const library = buildLibrary();
        const libraryHash = computeWeightedOutcomeLibraryHash(library);

        expect(() =>
            buildPreGeneratedRoundResult({
                expectedLibraryId: library.libraryId,
                expectedLibraryHash: libraryHash,
                selection: {libraryId: library.libraryId, libraryHash, totalWeight: 100.5, outcome: library.outcomes[0]},
                runtime: {roundId: "r", sessionId: "s", balanceBefore: 1, balanceAfter: 1, transactions: []},
            }),
        ).toThrow(PreGeneratedRoundBuildError);
    });
});
