import {
    RoundRecord,
    WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION,
    WeightedOutcomeLibraryBuildError,
    buildWeightedOutcomeLibrary,
} from "@fromstan/pokie";
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
                {id: "no-win", weight: 70, record: losing},
                {id: "win-10x", weight: 30, record: winning},
            ],
        });

        expect(library.schemaVersion).toBe(WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION);
        expect(library.libraryId).toBe("lib-1");
        expect(library.outcomes).toHaveLength(2);
        expect(library.outcomes[0]).toEqual({id: "no-win", weight: 70, record: losing});
        expect(library.outcomes[1]).toEqual({id: "win-10x", weight: 30, record: winning});
    });

    it("references the same record objects rather than copying them (already immutable)", () => {
        const record = artifactWithTotalWin("r1", 5);
        const library = buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, record}]});

        expect(library.outcomes[0].record).toBe(record);
    });

    it("accepts the current WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION explicitly", () => {
        const record = artifactWithTotalWin("r1", 0);
        expect(() =>
            buildWeightedOutcomeLibrary({
                libraryId: "lib-1",
                schemaVersion: WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION,
                outcomes: [{id: "a", weight: 1, record}],
            }),
        ).not.toThrow();
    });

    describe("fail-fast input validation", () => {
        it.each(["", "  "])("throws for libraryId %p", (libraryId) => {
            const record = artifactWithTotalWin("r1", 0);
            expect(
                getCode(() => buildWeightedOutcomeLibrary({libraryId, outcomes: [{id: "a", weight: 1, record}]})),
            ).toBe("weighted-outcome-library-id-invalid");
        });

        it("throws for an empty outcomes list", () => {
            expect(getCode(() => buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: []}))).toBe(
                "weighted-outcome-library-outcomes-empty",
            );
        });

        it.each([0, -1, 1.5, 2])("throws for schemaVersion %p", (schemaVersion) => {
            const record = artifactWithTotalWin("r1", 0);
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        schemaVersion,
                        outcomes: [{id: "a", weight: 1, record}],
                    }),
                ),
            ).toBe("weighted-outcome-library-schema-version-invalid");
        });

        it.each(["", "  "])("throws for an outcome id %p", (id) => {
            const record = artifactWithTotalWin("r1", 0);
            expect(
                getCode(() => buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id, weight: 1, record}]})),
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
                            {id: "dup", weight: 1, record: a},
                            {id: "dup", weight: 1, record: b},
                        ],
                    }),
                ),
            ).toBe("weighted-outcome-library-duplicate-id");
        });

        it.each([0, -1, NaN, Infinity])("throws for an outcome weight %p", (weight) => {
            const record = artifactWithTotalWin("r1", 0);
            expect(
                getCode(() => buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight, record}]})),
            ).toBe("weighted-outcome-weight-invalid");
        });

        it.each([-1, NaN, Infinity])("throws for an invalid record.payoutMultiplier %p", (payoutMultiplier) => {
            const record = {...artifactWithTotalWin("r1", 0), payoutMultiplier};
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, record}]}),
                ),
            ).toBe("weighted-outcome-payout-multiplier-invalid");
        });

        it("throws when a hand-crafted record is not JSON-safe (cyclic debug), caught by the per-outcome record validation", () => {
            const cyclic: Record<string, unknown> = {};
            cyclic.self = cyclic;
            const record = {...artifactWithTotalWin("r1", 0), debug: cyclic} as unknown as RoundRecord<string>;
            // RoundRecordValidator itself checks JSON safety, so this is caught by the per-outcome delegation
            // (item 5) before the library's own final toCanonicalJson pass would ever see it.
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, record}]}),
                ),
            ).toBe("weighted-outcome-record-invalid");
        });

        it.each([0, -1, NaN, Infinity])("throws for an invalid record.stake %p", (stake) => {
            const record = {...artifactWithTotalWin("r1", 0), stake};
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, record}]}),
                ),
            ).toBe("weighted-outcome-stake-invalid");
        });

        it("throws for a malformed-but-JSON-safe record (mismatched screen), never reaching the canonical library", () => {
            const record = {...artifactWithTotalWin("r1", 0), screen: [["Z", "Z", "Z"]]};
            const code = getCode(() =>
                buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, record}]}),
            );
            expect(code).toBe("weighted-outcome-record-invalid");
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
                            {id: "a", weight: Number.MAX_VALUE, record: a},
                            {id: "b", weight: Number.MAX_VALUE, record: b},
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
                origin: {...testProvenance, game: {...testProvenance.game, id: "other-game"}},
            });
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [
                            {id: "a", weight: 1, record: a},
                            {id: "b", weight: 1, record: b},
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
                origin: {...testProvenance, game: {...testProvenance.game, version: "9.9.9"}},
            });
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [
                            {id: "a", weight: 1, record: a},
                            {id: "b", weight: 1, record: b},
                        ],
                    }),
                ),
            ).toBe("weighted-outcome-library-inconsistent-provenance");
        });

        it("throws when outcomes have different provenance.configHash", () => {
            const a = artifactWith({roundId: "r1", totalWin: 0, origin: {...testProvenance, configHash: "hash-a"}});
            const b = artifactWith({roundId: "r2", totalWin: 0, origin: {...testProvenance, configHash: "hash-b"}});
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [
                            {id: "a", weight: 1, record: a},
                            {id: "b", weight: 1, record: b},
                        ],
                    }),
                ),
            ).toBe("weighted-outcome-library-inconsistent-provenance");
        });

        it("throws when outcomes have different provenance.pokieVersion", () => {
            const a = artifactWithTotalWin("r1", 0);
            const b = artifactWith({roundId: "r2", totalWin: 0, origin: {...testProvenance, pokieVersion: "9.9.9"}});
            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [
                            {id: "a", weight: 1, record: a},
                            {id: "b", weight: 1, record: b},
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
                            {id: "a", weight: 1, record: a},
                            {id: "b", weight: 1, record: b},
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
                            {id: "a", weight: 1, record: a},
                            {id: "b", weight: 1, record: b},
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
                    {id: "charlie", weight: 1, record: c},
                    {id: "alpha", weight: 1, record: a},
                    {id: "bravo", weight: 1, record: b},
                ],
            });

            expect(library.outcomes.map((outcome) => outcome.id)).toEqual(["alpha", "bravo", "charlie"]);
        });
    });

    describe("custom record validator", () => {
        it("still rejects a malformed-but-JSON-safe record even with a permissive custom validator injected", () => {
            const permissive = {validate: () => []};
            const record = {...artifactWithTotalWin("r1", 0), screen: [["Z", "Z", "Z"]]};

            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [{id: "a", weight: 1, record}],
                        recordValidator: permissive,
                    }),
                ),
            ).toBe("weighted-outcome-record-invalid");
        });

        it("rejects an otherwise-valid record when the additional custom validator itself reports an issue", () => {
            const alwaysFails = {
                validate: () => [{code: "custom-rule-violated", severity: "error" as const, message: "nope"}],
            };
            const record = artifactWithTotalWin("r1", 0);

            expect(
                getCode(() =>
                    buildWeightedOutcomeLibrary({
                        libraryId: "lib-1",
                        outcomes: [{id: "a", weight: 1, record}],
                        recordValidator: alwaysFails,
                    }),
                ),
            ).toBe("weighted-outcome-record-invalid");
        });

        it("builds successfully without a custom validator when the record is genuinely valid", () => {
            const record = artifactWithTotalWin("r1", 0);
            expect(() =>
                buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, record}]}),
            ).not.toThrow();
        });
    });

    describe("immutability", () => {
        it("returns a deeply frozen library that throws on any attempted mutation", () => {
            const record = artifactWithTotalWin("r1", 5);
            const library = buildWeightedOutcomeLibrary({libraryId: "lib-1", outcomes: [{id: "a", weight: 1, record}]});

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
