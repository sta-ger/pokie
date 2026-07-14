import {
    RoundArtifact,
    WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION,
    WeightedOutcomeLibraryBuildError,
    buildWeightedOutcomeLibrary,
} from "pokie";
import {artifactWithTotalWin} from "./WeightedOutcomeTestFixtures.js";

function getCode(fn: () => unknown): string {
    try {
        fn();
        fail("expected the callback to throw");
    } catch (error) {
        if (!(error instanceof WeightedOutcomeLibraryBuildError)) {
            throw error;
        }
        return error.getCode();
    }
    return "";
}

describe("buildWeightedOutcomeLibrary", () => {
    it("builds a library with the expected shape", () => {
        const losing = artifactWithTotalWin("r1", 0);
        const winning = artifactWithTotalWin("r2", 10);

        const library = buildWeightedOutcomeLibrary({
            libraryId: "lib-1",
            outcomes: [
                {id: "no-win", weight: 70, artifact: losing},
                {id: "win-10x", weight: 30, artifact: winning},
            ],
        });

        expect(library.schemaVersion).toBe(WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION);
        expect(library.libraryId).toBe("lib-1");
        expect(library.outcomes).toHaveLength(2);
        expect(library.outcomes[0]).toEqual({id: "no-win", weight: 70, artifact: losing});
        expect(library.outcomes[1]).toEqual({id: "win-10x", weight: 30, artifact: winning});
    });

    it("references the same artifact objects rather than copying them (already immutable)", () => {
        const artifact = artifactWithTotalWin("r1", 5);
        const library = buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, artifact}]});

        expect(library.outcomes[0].artifact).toBe(artifact);
    });

    it("accepts the current WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION explicitly", () => {
        const artifact = artifactWithTotalWin("r1", 0);
        expect(() =>
            buildWeightedOutcomeLibrary({
                libraryId: "lib-1",
                schemaVersion: WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION,
                outcomes: [{id: "a", weight: 1, artifact}],
            }),
        ).not.toThrow();
    });

    describe("fail-fast input validation", () => {
        it.each(["", "  "])("throws for libraryId %p", (libraryId) => {
            const artifact = artifactWithTotalWin("r1", 0);
            expect(
                getCode(() => buildWeightedOutcomeLibrary({libraryId, outcomes: [{id: "a", weight: 1, artifact}]})),
            ).toBe("weighted-outcome-library-id-invalid");
        });

        it("throws for an empty outcomes list", () => {
            expect(getCode(() => buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: []}))).toBe(
                "weighted-outcome-library-outcomes-empty",
            );
        });

        it.each([0, -1, 1.5, 2])("throws for schemaVersion %p", (schemaVersion) => {
            const artifact = artifactWithTotalWin("r1", 0);
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        schemaVersion,
                        outcomes: [{id: "a", weight: 1, artifact}],
                    }),
                ),
            ).toBe("weighted-outcome-library-schema-version-invalid");
        });

        it.each(["", "  "])("throws for an outcome id %p", (id) => {
            const artifact = artifactWithTotalWin("r1", 0);
            expect(
                getCode(() => buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id, weight: 1, artifact}]})),
            ).toBe("weighted-outcome-id-invalid");
        });

        it("throws for a duplicate outcome id", () => {
            const a = artifactWithTotalWin("r1", 0);
            const b = artifactWithTotalWin("r2", 5);
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [
                            {id: "dup", weight: 1, artifact: a},
                            {id: "dup", weight: 1, artifact: b},
                        ],
                    }),
                ),
            ).toBe("weighted-outcome-library-duplicate-id");
        });

        it.each([-1, NaN, Infinity])("throws for an outcome weight %p", (weight) => {
            const artifact = artifactWithTotalWin("r1", 0);
            expect(
                getCode(() => buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight, artifact}]})),
            ).toBe("weighted-outcome-weight-invalid");
        });

        it("throws when every outcome weight is zero (total weight must be > 0)", () => {
            const artifact = artifactWithTotalWin("r1", 0);
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 0, artifact}]}),
                ),
            ).toBe("weighted-outcome-library-total-weight-invalid");
        });

        it.each([-1, NaN, Infinity])("throws for an invalid artifact.payoutMultiplier %p", (payoutMultiplier) => {
            const artifact = {...artifactWithTotalWin("r1", 0), payoutMultiplier};
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, artifact}]}),
                ),
            ).toBe("weighted-outcome-payout-multiplier-invalid");
        });

        it("throws when a hand-crafted artifact is not JSON-safe (cyclic debug)", () => {
            const cyclic: Record<string, unknown> = {};
            cyclic.self = cyclic;
            const artifact = {...artifactWithTotalWin("r1", 0), debug: cyclic} as unknown as RoundArtifact<string>;
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, artifact}]}),
                ),
            ).toBe("weighted-outcome-library-not-json-safe");
        });
    });

    describe("immutability", () => {
        it("returns a deeply frozen library that throws on any attempted mutation", () => {
            const artifact = artifactWithTotalWin("r1", 5);
            const library = buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, artifact}]});

            expect(() => {
                (library as {libraryId: string}).libraryId = "tampered";
            }).toThrow(TypeError);
            expect(() => {
                (library.outcomes as unknown[]).push({});
            }).toThrow(TypeError);
            expect(() => {
                (library.outcomes[0] as {weight: number}).weight = 999;
            }).toThrow(TypeError);
        });
    });
});
