import {
    PokieJsonWeightedOutcomeLibraryProjector,
    WeightedOutcomeLibrary,
    buildWeightedOutcomeLibrary,
    computeWeightedOutcomeLibraryHash,
} from "pokie";
import {artifactWithTotalWin} from "./WeightedOutcomeTestFixtures.js";

function sampleLibrary(): WeightedOutcomeLibrary<string> {
    return buildWeightedOutcomeLibrary({
        libraryId: "lib-1",
        outcomes: [
            {id: "no-win", weight: 70, artifact: artifactWithTotalWin("r1", 0)},
            {id: "small-win", weight: 25, artifact: artifactWithTotalWin("r2", 2)},
            {id: "jackpot", weight: 5, artifact: artifactWithTotalWin("r3", 100)},
        ],
    });
}

describe("PokieJsonWeightedOutcomeLibraryProjector", () => {
    it("stamps the projection with computeWeightedOutcomeLibraryHash's own output", () => {
        const library = sampleLibrary();
        const json = new PokieJsonWeightedOutcomeLibraryProjector().project(library);

        expect(json.hash).toBe(computeWeightedOutcomeLibraryHash(library));
        expect(json.hash).toMatch(/^sha256:[0-9a-f]{64}$/);
    });

    it("carries every WeightedOutcomeLibrary field through unchanged, aside from adding hash", () => {
        const library = sampleLibrary();
        const {hash: _hash, ...json} = new PokieJsonWeightedOutcomeLibraryProjector().project(library);

        expect(json).toEqual(library);
    });

    it("returns a deeply frozen result", () => {
        const json = new PokieJsonWeightedOutcomeLibraryProjector().project(sampleLibrary());

        expect(() => {
            (json as {hash: string}).hash = "tampered";
        }).toThrow(TypeError);
    });

    it("round-trips through JSON.stringify/parse to an identical hash", () => {
        const library = sampleLibrary();
        const json = new PokieJsonWeightedOutcomeLibraryProjector().project(library);
        const {hash: _hash, ...roundTripped} = JSON.parse(JSON.stringify(json));

        expect(computeWeightedOutcomeLibraryHash(roundTripped)).toBe(json.hash);
    });

    it("produces the same hash regardless of the source library's own key order", () => {
        const library = sampleLibrary();
        const reordered: WeightedOutcomeLibrary<string> = {
            outcomes: library.outcomes,
            libraryId: library.libraryId,
            schemaVersion: library.schemaVersion,
        };

        expect(computeWeightedOutcomeLibraryHash(reordered)).toBe(computeWeightedOutcomeLibraryHash(library));
    });

    it("produces the same hash regardless of the order outcomes were supplied to the builder in", () => {
        const a = artifactWithTotalWin("r1", 0);
        const b = artifactWithTotalWin("r2", 2);
        const c = artifactWithTotalWin("r3", 100);

        const libraryOne = buildWeightedOutcomeLibrary({
            libraryId: "lib-order",
            outcomes: [
                {id: "jackpot", weight: 5, artifact: c},
                {id: "no-win", weight: 70, artifact: a},
                {id: "small-win", weight: 25, artifact: b},
            ],
        });
        const libraryTwo = buildWeightedOutcomeLibrary({
            libraryId: "lib-order",
            outcomes: [
                {id: "small-win", weight: 25, artifact: b},
                {id: "jackpot", weight: 5, artifact: c},
                {id: "no-win", weight: 70, artifact: a},
            ],
        });

        expect(libraryOne.outcomes.map((outcome) => outcome.id)).toEqual(libraryTwo.outcomes.map((outcome) => outcome.id));
        expect(computeWeightedOutcomeLibraryHash(libraryOne)).toBe(computeWeightedOutcomeLibraryHash(libraryTwo));

        const projector = new PokieJsonWeightedOutcomeLibraryProjector();
        expect(projector.project(libraryOne).hash).toBe(projector.project(libraryTwo).hash);
    });

    it("changes the hash when a semantic field changes", () => {
        const library = sampleLibrary();
        const changed: WeightedOutcomeLibrary<string> = {
            ...library,
            outcomes: [{...library.outcomes[0], weight: library.outcomes[0].weight + 1}, ...library.outcomes.slice(1)],
        };

        expect(computeWeightedOutcomeLibraryHash(changed)).not.toBe(computeWeightedOutcomeLibraryHash(library));
    });

    it("fails fast when the library contains a circular reference", () => {
        const library = sampleLibrary();
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        const invalid = {
            ...library,
            outcomes: [{...library.outcomes[0], artifact: {...library.outcomes[0].artifact, debug: cyclic}}],
        } as unknown as WeightedOutcomeLibrary<string>;

        expect(() => computeWeightedOutcomeLibraryHash(invalid)).toThrow(/circular reference/);
    });
});
