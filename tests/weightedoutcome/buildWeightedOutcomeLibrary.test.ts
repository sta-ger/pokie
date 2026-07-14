import {
    RoundArtifact,
    WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION,
    WeightedOutcomeLibraryBuildError,
    buildWeightedOutcomeLibrary,
} from "pokie";
import {
    artifactWith,
    artifactWithTotalWin,
    testProvenance,
} from "./WeightedOutcomeTestFixtures.js";

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

        it.each([0, -1, NaN, Infinity])("throws for an outcome weight %p", (weight) => {
            const artifact = artifactWithTotalWin("r1", 0);
            expect(
                getCode(() => buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight, artifact}]})),
            ).toBe("weighted-outcome-weight-invalid");
        });

        it.each([-1, NaN, Infinity])("throws for an invalid artifact.payoutMultiplier %p", (payoutMultiplier) => {
            const artifact = {...artifactWithTotalWin("r1", 0), payoutMultiplier};
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, artifact}]}),
                ),
            ).toBe("weighted-outcome-payout-multiplier-invalid");
        });

        it("throws when a hand-crafted artifact is not JSON-safe (cyclic debug), caught by the per-outcome artifact validation", () => {
            const cyclic: Record<string, unknown> = {};
            cyclic.self = cyclic;
            const artifact = {...artifactWithTotalWin("r1", 0), debug: cyclic} as unknown as RoundArtifact<string>;
            // RoundArtifactValidator itself checks JSON safety, so this is caught by the per-outcome delegation
            // (item 5) before the library's own final toCanonicalJson pass would ever see it.
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, artifact}]}),
                ),
            ).toBe("weighted-outcome-artifact-invalid");
        });

        it.each([0, -1, NaN, Infinity])("throws for an invalid artifact.stake %p", (stake) => {
            const artifact = {...artifactWithTotalWin("r1", 0), stake};
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, artifact}]}),
                ),
            ).toBe("weighted-outcome-stake-invalid");
        });

        it("throws for a malformed-but-JSON-safe artifact (mismatched screen), never reaching the canonical library", () => {
            const artifact = {...artifactWithTotalWin("r1", 0), screen: [["Z", "Z", "Z"]]};
            const code = getCode(() =>
                buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, artifact}]}),
            );
            expect(code).toBe("weighted-outcome-artifact-invalid");
        });

        it("throws for a total weight that overflows to Infinity even though every individual weight is finite", () => {
            const a = artifactWithTotalWin("r1", 1);
            const b = artifactWithTotalWin("r2", 2);
            expect(Number.isFinite(Number.MAX_VALUE)).toBe(true);
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [
                            {id: "a", weight: Number.MAX_VALUE, artifact: a},
                            {id: "b", weight: Number.MAX_VALUE, artifact: b},
                        ],
                    }),
                ),
            ).toBe("weighted-outcome-library-total-weight-invalid");
        });
    });

    describe("library homogeneity", () => {
        it("throws when outcomes have different provenance.game.id", () => {
            const a = artifactWithTotalWin("r1", 0);
            const b = artifactWith({
                roundId: "r2",
                totalWin: 0,
                provenance: {...testProvenance, game: {...testProvenance.game, id: "other-game"}},
            });
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [
                            {id: "a", weight: 1, artifact: a},
                            {id: "b", weight: 1, artifact: b},
                        ],
                    }),
                ),
            ).toBe("weighted-outcome-library-inconsistent-provenance");
        });

        it("throws when outcomes have different provenance.game.version", () => {
            const a = artifactWithTotalWin("r1", 0);
            const b = artifactWith({
                roundId: "r2",
                totalWin: 0,
                provenance: {...testProvenance, game: {...testProvenance.game, version: "9.9.9"}},
            });
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [
                            {id: "a", weight: 1, artifact: a},
                            {id: "b", weight: 1, artifact: b},
                        ],
                    }),
                ),
            ).toBe("weighted-outcome-library-inconsistent-provenance");
        });

        it("throws when outcomes have different provenance.configHash", () => {
            const a = artifactWith({roundId: "r1", totalWin: 0, provenance: {...testProvenance, configHash: "hash-a"}});
            const b = artifactWith({roundId: "r2", totalWin: 0, provenance: {...testProvenance, configHash: "hash-b"}});
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [
                            {id: "a", weight: 1, artifact: a},
                            {id: "b", weight: 1, artifact: b},
                        ],
                    }),
                ),
            ).toBe("weighted-outcome-library-inconsistent-provenance");
        });

        it("throws when outcomes have different provenance.pokieVersion", () => {
            const a = artifactWithTotalWin("r1", 0);
            const b = artifactWith({roundId: "r2", totalWin: 0, provenance: {...testProvenance, pokieVersion: "9.9.9"}});
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [
                            {id: "a", weight: 1, artifact: a},
                            {id: "b", weight: 1, artifact: b},
                        ],
                    }),
                ),
            ).toBe("weighted-outcome-library-inconsistent-provenance");
        });

        it("throws when outcomes have different betMode", () => {
            const a = artifactWithTotalWin("r1", 0);
            const b = artifactWith({roundId: "r2", totalWin: 0, betMode: "freeGames"});
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [
                            {id: "a", weight: 1, artifact: a},
                            {id: "b", weight: 1, artifact: b},
                        ],
                    }),
                ),
            ).toBe("weighted-outcome-library-inconsistent-bet-mode");
        });

        it("throws when outcomes have different stake", () => {
            const a = artifactWithTotalWin("r1", 0);
            const b = artifactWith({roundId: "r2", totalWin: 0, stake: 2});
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [
                            {id: "a", weight: 1, artifact: a},
                            {id: "b", weight: 1, artifact: b},
                        ],
                    }),
                ),
            ).toBe("weighted-outcome-library-inconsistent-stake");
        });
    });

    describe("canonical ordering", () => {
        it("sorts outcomes by id regardless of the input order", () => {
            const a = artifactWithTotalWin("r1", 0);
            const b = artifactWithTotalWin("r2", 1);
            const c = artifactWithTotalWin("r3", 2);

            const library = buildWeightedOutcomeLibrary({
                libraryId: "lib-1",
                outcomes: [
                    {id: "charlie", weight: 1, artifact: c},
                    {id: "alpha", weight: 1, artifact: a},
                    {id: "bravo", weight: 1, artifact: b},
                ],
            });

            expect(library.outcomes.map((outcome) => outcome.id)).toEqual(["alpha", "bravo", "charlie"]);
        });
    });

    describe("custom artifact validator", () => {
        it("still rejects a malformed-but-JSON-safe artifact even with a permissive custom validator injected", () => {
            const permissive = {validate: () => []};
            const artifact = {...artifactWithTotalWin("r1", 0), screen: [["Z", "Z", "Z"]]};

            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [{id: "a", weight: 1, artifact}],
                        artifactValidator: permissive,
                    }),
                ),
            ).toBe("weighted-outcome-artifact-invalid");
        });

        it("rejects an otherwise-valid artifact when the additional custom validator itself reports an issue", () => {
            const alwaysFails = {
                validate: () => [{code: "custom-rule-violated", severity: "error" as const, message: "nope"}],
            };
            const artifact = artifactWithTotalWin("r1", 0);

            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [{id: "a", weight: 1, artifact}],
                        artifactValidator: alwaysFails,
                    }),
                ),
            ).toBe("weighted-outcome-artifact-invalid");
        });

        it("builds successfully without a custom validator when the artifact is genuinely valid", () => {
            const artifact = artifactWithTotalWin("r1", 0);
            expect(() =>
                buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, artifact}]}),
            ).not.toThrow();
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
