import {PreGeneratedRoundReplayer, WeightedOutcomeLibrary, buildWeightedOutcomeLibrary, computeWeightedOutcomeLibraryHash} from "pokie";
import {artifactWith} from "../weightedoutcome/WeightedOutcomeTestFixtures";

function buildLibrary(): WeightedOutcomeLibrary<string> {
    return buildWeightedOutcomeLibrary({
        libraryId: "replay-test",
        outcomes: [
            {id: "a", weight: 33, artifact: artifactWith({roundId: "a", totalWin: 0})},
            {id: "b", weight: 33, artifact: artifactWith({roundId: "b", totalWin: 10})},
            {id: "c", weight: 34, artifact: artifactWith({roundId: "c", totalWin: 200})},
        ],
    });
}

describe("PreGeneratedRoundReplayer", () => {
    it("reproduces the exact same outcome for the same (library, seed, round)", () => {
        const library = buildLibrary();
        const libraryHash = computeWeightedOutcomeLibraryHash(library);
        const replayer = new PreGeneratedRoundReplayer();

        const first = replayer.replay({library, libraryHash, seed: "player-seed", round: 7});
        const second = replayer.replay({library, libraryHash, seed: "player-seed", round: 7});

        expect(second.outcomeId).toBe(first.outcomeId);
        expect(second.weight).toBe(first.weight);
        expect(second.totalWin).toBe(first.totalWin);
        expect(second.payoutMultiplier).toBe(first.payoutMultiplier);
    });

    it("varies across different rounds of the same seed (with overwhelming probability)", () => {
        const library = buildLibrary();
        const libraryHash = computeWeightedOutcomeLibraryHash(library);
        const replayer = new PreGeneratedRoundReplayer();

        const outcomeIds = Array.from({length: 50}, (_, index) =>
            replayer.replay({library, libraryHash, seed: "player-seed", round: index + 1}).outcomeId,
        );

        expect(new Set(outcomeIds).size).toBeGreaterThan(1);
    });

    it("varies across different seeds for the same round", () => {
        const library = buildLibrary();
        const libraryHash = computeWeightedOutcomeLibraryHash(library);
        const replayer = new PreGeneratedRoundReplayer();

        const outcomeIds = Array.from({length: 50}, (_, index) =>
            replayer.replay({library, libraryHash, seed: `seed-${index}`, round: 1}).outcomeId,
        );

        expect(new Set(outcomeIds).size).toBeGreaterThan(1);
    });

    it("rejects a non-positive-integer round", () => {
        const library = buildLibrary();
        const libraryHash = computeWeightedOutcomeLibraryHash(library);
        const replayer = new PreGeneratedRoundReplayer();

        expect(() => replayer.replay({library, libraryHash, seed: "s", round: 0})).toThrow(/positive integer/);
        expect(() => replayer.replay({library, libraryHash, seed: "s", round: 1.5})).toThrow(/positive integer/);
    });
});
