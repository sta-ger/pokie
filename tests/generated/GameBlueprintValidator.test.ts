import {GameBlueprint, GameBlueprintValidator} from "pokie";

function validBlueprint(): GameBlueprint {
    return {
        manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        reels: 5,
        rows: 3,
        symbols: ["A", "K", "Q", "J", "W", "S"],
        wilds: ["W"],
        scatters: ["S"],
        paylines: [
            [1, 1, 1, 1, 1],
            [0, 0, 0, 0, 0],
            [2, 2, 2, 2, 2],
        ],
        paytable: {
            A: {3: 5, 4: 10, 5: 20},
            K: {3: 4, 4: 8, 5: 16},
            Q: {3: 3, 4: 6, 5: 12},
            J: {3: 2, 4: 4, 5: 8},
            S: {3: 2, 4: 5, 5: 10},
        },
        reelStrips: undefined,
    };
}

function codesOf(issues: {code: string}[]): string[] {
    return issues.map((issue) => issue.code);
}

describe("GameBlueprintValidator", () => {
    const validator = new GameBlueprintValidator();

    it("returns no issues for a well-formed blueprint", () => {
        expect(validator.validate(validBlueprint())).toEqual([]);
    });

    it("accepts a blueprint using symbolWeights instead of reelStrips", () => {
        const blueprint = validBlueprint();
        blueprint.symbolWeights = {A: 10, K: 10, Q: 10, J: 10, W: 3, S: 2};

        expect(validator.validate(blueprint).filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("accepts a blueprint using explicit reelStrips", () => {
        const blueprint = validBlueprint();
        blueprint.reelStrips = new Array(5).fill(["A", "K", "Q", "J", "W", "S"]);

        expect(validator.validate(blueprint).filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("rejects a non-object blueprint", () => {
        expect(codesOf(validator.validate(null))).toEqual(["blueprint-not-object"]);
        expect(codesOf(validator.validate([1, 2]))).toEqual(["blueprint-not-object"]);
        expect(codesOf(validator.validate("nope"))).toEqual(["blueprint-not-object"]);
    });

    it("flags a missing/invalid manifest", () => {
        const blueprint = {...validBlueprint(), manifest: {id: "", name: "Crazy Fruits"}};

        expect(codesOf(validator.validate(blueprint))).toEqual(
            expect.arrayContaining(["blueprint-manifest-invalid-id", "blueprint-manifest-invalid-version"]),
        );
    });

    it("flags invalid reels/rows", () => {
        const blueprint = {...validBlueprint(), reels: 0, rows: -1};

        expect(codesOf(validator.validate(blueprint))).toEqual(
            expect.arrayContaining(["blueprint-reels-invalid", "blueprint-rows-invalid"]),
        );
    });

    it("flags empty and duplicate symbols", () => {
        expect(codesOf(validator.validate({...validBlueprint(), symbols: []}))).toContain("blueprint-symbols-invalid");
        expect(codesOf(validator.validate({...validBlueprint(), symbols: ["A", "A", "K"]}))).toContain(
            "blueprint-symbols-duplicate",
        );
    });

    it("flags wilds/scatters referencing a symbol not in the symbols list", () => {
        const blueprint = {...validBlueprint(), wilds: ["W", "ZZ"]};

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-wilds-unknown-symbol");
    });

    it("flags a missing paytable", () => {
        const blueprint = {...validBlueprint()} as Partial<GameBlueprint>;
        Reflect.deleteProperty(blueprint, "paytable");

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-paytable-missing");
    });

    it("flags a paytable entry for a symbol not in symbols", () => {
        const blueprint = {...validBlueprint(), paytable: {ZZ: {3: 5}}};

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-paytable-unknown-symbol");
    });

    it("warns (not errors) about a paytable entry for a wild symbol", () => {
        const blueprint = {...validBlueprint(), paytable: {...validBlueprint().paytable, W: {3: 5}}};

        const issues = validator.validate(blueprint);
        const wildIssue = issues.find((issue) => issue.code === "blueprint-paytable-wild-symbol");
        expect(wildIssue?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("flags an out-of-range match-count and a non-positive multiplier", () => {
        const blueprint = {...validBlueprint(), paytable: {A: {1: 5, 3: -2, 9: 3}}};

        expect(codesOf(validator.validate(blueprint))).toEqual(
            expect.arrayContaining(["blueprint-paytable-invalid-times", "blueprint-paytable-invalid-multiplier"]),
        );
    });

    it("flags a payline whose length does not match reels", () => {
        const blueprint = {...validBlueprint(), paylines: [[0, 0, 0]]};

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-payline-invalid");
    });

    it("flags a payline with a row index out of bounds", () => {
        const blueprint = {...validBlueprint(), paylines: [[0, 0, 0, 0, 5]]};

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-payline-invalid");
    });

    it("flags reelStrips with the wrong reel count or an unknown symbol", () => {
        const wrongCount = {...validBlueprint(), reelStrips: [["A"]]};
        expect(codesOf(validator.validate(wrongCount))).toContain("blueprint-reelstrips-invalid");

        const unknownSymbol = {...validBlueprint(), reelStrips: new Array(5).fill(["ZZ"])};
        expect(codesOf(validator.validate(unknownSymbol))).toContain("blueprint-reelstrip-invalid");
    });

    it("flags symbolWeights with an unknown symbol or a non-positive weight", () => {
        const blueprint = {...validBlueprint(), symbolWeights: {A: 10, ZZ: 5, K: -1}};

        expect(codesOf(validator.validate(blueprint))).toEqual(
            expect.arrayContaining(["blueprint-symbolweights-unknown-symbol", "blueprint-symbolweights-invalid-weight"]),
        );
    });

    it("warns when both reelStrips and symbolWeights are set", () => {
        const blueprint = {
            ...validBlueprint(),
            reelStrips: new Array(5).fill(["A", "K", "Q", "J", "W", "S"]),
            symbolWeights: {A: 10, K: 10, Q: 10, J: 10, W: 3, S: 2},
        };

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-reelstrips-and-weights")?.severity).toBe("warning");
    });

    // validBlueprint() has 5 reels, so reelStripGeneration must always have exactly 5 entries.
    const literalEntry = {type: "literal", strip: ["A", "K", "Q", "J", "W", "S"]};
    function generatedEntry(overrides: Record<string, unknown> = {}) {
        return {type: "generated", length: 20, symbolCounts: {A: 6, K: 6, Q: 4, J: 2, W: 1, S: 1}, seed: 1, ...overrides};
    }

    describe("reelStripGeneration", () => {
        it("accepts a blueprint using reelStripGeneration with symbolCounts (all reels generated)", () => {
            const blueprint = {...validBlueprint(), reelStripGeneration: new Array(5).fill(generatedEntry())};

            expect(validator.validate(blueprint).filter((issue) => issue.severity === "error")).toEqual([]);
        });

        it("accepts a blueprint using reelStripGeneration with symbolWeights (all reels generated)", () => {
            const entry = generatedEntry({symbolCounts: undefined, symbolWeights: {A: 6, K: 6, Q: 4, J: 2, W: 1, S: 1}});
            const blueprint = {...validBlueprint(), reelStripGeneration: new Array(5).fill(entry)};

            expect(validator.validate(blueprint).filter((issue) => issue.severity === "error")).toEqual([]);
        });

        it("accepts a blueprint mixing literal and generated reels", () => {
            const blueprint = {
                ...validBlueprint(),
                reelStripGeneration: [literalEntry, generatedEntry(), literalEntry, generatedEntry({seed: 2, length: 15}), literalEntry],
            };

            expect(validator.validate(blueprint).filter((issue) => issue.severity === "error")).toEqual([]);
        });

        it("accepts reels with entirely independent generation configs (different length/seed/constraints)", () => {
            const blueprint = {
                ...validBlueprint(),
                reelStripGeneration: [
                    generatedEntry({length: 10, seed: 1}),
                    generatedEntry({length: 40, seed: 100, constraints: [{type: "maximumConsecutiveOccurrences", maximumConsecutive: 2}]}),
                    generatedEntry({length: 20, seed: -5, symbolCounts: undefined, symbolWeights: {A: 1, K: 1, Q: 1, J: 1, W: 1, S: 1}}),
                    literalEntry,
                    generatedEntry({length: 8, seed: 42, maxAttempts: 5}),
                ],
            };

            expect(validator.validate(blueprint).filter((issue) => issue.severity === "error")).toEqual([]);
        });

        it("flags a reelStripGeneration array whose length does not match \"reels\"", () => {
            const blueprint = {...validBlueprint(), reelStripGeneration: [generatedEntry(), generatedEntry()]};

            expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstripgeneration-invalid");
        });

        it("flags an entry with neither a valid \"literal\" nor \"generated\" type", () => {
            const blueprint = {
                ...validBlueprint(),
                reelStripGeneration: [{type: "bogus"}, literalEntry, literalEntry, literalEntry, literalEntry],
            };

            expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstripgeneration-invalid-entry-type");
        });

        it("flags a literal entry with an empty or unknown-symbol strip", () => {
            const blueprint = {
                ...validBlueprint(),
                reelStripGeneration: [{type: "literal", strip: ["ZZ"]}, literalEntry, literalEntry, literalEntry, literalEntry],
            };

            expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstripgeneration-invalid-literal");
        });

        it("flags a generated entry with an invalid length or a non-integer seed", () => {
            const blueprint = {
                ...validBlueprint(),
                reelStripGeneration: [generatedEntry({length: 0, seed: 1.5}), literalEntry, literalEntry, literalEntry, literalEntry],
            };

            expect(codesOf(validator.validate(blueprint))).toEqual(
                expect.arrayContaining(["blueprint-reelstripgeneration-invalid-length", "blueprint-reelstripgeneration-invalid-seed"]),
            );
        });

        it("flags a generated entry missing both symbolCounts and symbolWeights", () => {
            const blueprint = {
                ...validBlueprint(),
                reelStripGeneration: [generatedEntry({symbolCounts: undefined}), literalEntry, literalEntry, literalEntry, literalEntry],
            };

            expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstripgeneration-source-invalid");
        });

        it("flags a generated entry with both symbolCounts and symbolWeights set", () => {
            const blueprint = {
                ...validBlueprint(),
                reelStripGeneration: [generatedEntry({symbolWeights: {A: 1}}), literalEntry, literalEntry, literalEntry, literalEntry],
            };

            expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstripgeneration-source-invalid");
        });

        it("flags a generated entry's symbolCounts referencing an unknown symbol or a negative count", () => {
            const blueprint = {
                ...validBlueprint(),
                reelStripGeneration: [
                    generatedEntry({symbolCounts: {A: 6, ZZ: 5, K: -1}}),
                    literalEntry,
                    literalEntry,
                    literalEntry,
                    literalEntry,
                ],
            };

            expect(codesOf(validator.validate(blueprint))).toEqual(
                expect.arrayContaining(["blueprint-reelstripgeneration-unknown-symbol", "blueprint-reelstripgeneration-invalid-count"]),
            );
        });

        it("flags a generated entry's lockedPositions with an out-of-range index or an unknown symbol", () => {
            const blueprint = {
                ...validBlueprint(),
                reelStripGeneration: [
                    generatedEntry({length: 10, lockedPositions: {10: "A", 2: "ZZ"}}),
                    literalEntry,
                    literalEntry,
                    literalEntry,
                    literalEntry,
                ],
            };

            expect(codesOf(validator.validate(blueprint))).toEqual(
                expect.arrayContaining(["blueprint-reelstripgeneration-invalid-lockedposition-index", "blueprint-reelstripgeneration-unknown-symbol"]),
            );
        });

        it("flags an invalid maxAttempts, roundingPolicy, or remainderTieBreakPolicy", () => {
            const blueprint = {
                ...validBlueprint(),
                reelStripGeneration: [
                    generatedEntry({maxAttempts: 0, roundingPolicy: "bogus", remainderTieBreakPolicy: "bogus"}),
                    literalEntry,
                    literalEntry,
                    literalEntry,
                    literalEntry,
                ],
            };

            expect(codesOf(validator.validate(blueprint))).toEqual(
                expect.arrayContaining([
                    "blueprint-reelstripgeneration-invalid-maxattempts",
                    "blueprint-reelstripgeneration-invalid-roundingpolicy",
                    "blueprint-reelstripgeneration-invalid-tiebreakpolicy",
                ]),
            );
        });

        it("errors (not warns) when both reelStrips and reelStripGeneration are set", () => {
            const blueprint = {
                ...validBlueprint(),
                reelStrips: new Array(5).fill(["A", "K", "Q", "J", "W", "S"]),
                reelStripGeneration: new Array(5).fill(generatedEntry()),
            };

            const issues = validator.validate(blueprint);
            expect(issues.find((issue) => issue.code === "blueprint-reelstrips-and-generation")?.severity).toBe("error");
        });

        it("warns (does not error) when both reelStripGeneration and symbolWeights are set", () => {
            const blueprint = {
                ...validBlueprint(),
                reelStripGeneration: new Array(5).fill(generatedEntry()),
                symbolWeights: {A: 6, K: 6, Q: 4, J: 2, W: 1, S: 1},
            };

            const issues = validator.validate(blueprint);
            expect(issues.find((issue) => issue.code === "blueprint-reelstripgeneration-and-weights")?.severity).toBe("warning");
            expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
        });

        it("flags a paytable/wild/scatter symbol that never appears in reelStripGeneration", () => {
            const entry = generatedEntry({symbolCounts: {A: 10, K: 5, Q: 5, W: 1}}); // missing "J" and "S"
            const blueprint = {...validBlueprint(), reelStripGeneration: new Array(5).fill(entry)};

            expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstripgeneration-missing-symbol");
        });

        it("treats a symbolCounts entry of 0 as absent from the reel (still unreachable, not a false pass)", () => {
            // "J" is declared (so validateReelStripGenerationCounts doesn't flag it as unknown) but
            // with a count of 0 on every reel -- it can never actually land, exactly as if it were
            // omitted entirely, so it must still be flagged as unreachable.
            const entry = generatedEntry({symbolCounts: {A: 10, K: 5, Q: 5, J: 0, W: 1, S: 1}});
            const blueprint = {...validBlueprint(), reelStripGeneration: new Array(5).fill(entry)};

            const issues = validator.validate(blueprint);
            const missing = issues.find((issue) => issue.code === "blueprint-reelstripgeneration-missing-symbol");
            expect(missing?.message).toContain('"J"');
            expect(codesOf(issues)).not.toContain("blueprint-reelstripgeneration-unknown-symbol");
        });

        it("warns when a single symbol dominates reelStripGeneration's weighting", () => {
            const entry = generatedEntry({length: 60, symbolCounts: {A: 1, K: 1, Q: 1, J: 1, W: 1, S: 55}});
            const blueprint = {...validBlueprint(), reelStripGeneration: new Array(5).fill(entry)};

            const issues = validator.validate(blueprint);
            expect(issues.find((issue) => issue.code === "blueprint-weighting-dominant-symbol")?.severity).toBe("warning");
            expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
        });

        describe("constraint spec validation", () => {
            it("flags a missing required field (minimumCircularDistance without minimumDistance)", () => {
                const entry = generatedEntry({constraints: [{type: "minimumCircularDistance"}]});
                const blueprint = {...validBlueprint(), reelStripGeneration: new Array(5).fill(entry)};

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstripgeneration-invalid-constraint-field");
            });

            it("flags a wrongly-typed field (maximumConsecutive as a string)", () => {
                const entry = generatedEntry({constraints: [{type: "maximumConsecutiveOccurrences", maximumConsecutive: "two"}]});
                const blueprint = {...validBlueprint(), reelStripGeneration: new Array(5).fill(entry)};

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstripgeneration-invalid-constraint-field");
            });

            it("flags a non-positive numeric bound (minimumDistance = -1)", () => {
                const entry = generatedEntry({constraints: [{type: "minimumCircularDistance", minimumDistance: -1}]});
                const blueprint = {...validBlueprint(), reelStripGeneration: new Array(5).fill(entry)};

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstripgeneration-invalid-constraint-field");
            });

            it("flags an unknown symbol in symbolIds", () => {
                const entry = generatedEntry({constraints: [{type: "minimumCircularDistance", minimumDistance: 2, symbolIds: ["ZZ"]}]});
                const blueprint = {...validBlueprint(), reelStripGeneration: new Array(5).fill(entry)};

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstripgeneration-unknown-symbol");
            });

            it("flags a malformed pair and an unknown symbol within a pair (forbiddenAdjacency)", () => {
                const entry = generatedEntry({
                    constraints: [{type: "forbiddenAdjacency", pairs: [["A"], ["A", "ZZ"]]}],
                });
                const blueprint = {...validBlueprint(), reelStripGeneration: new Array(5).fill(entry)};

                expect(codesOf(validator.validate(blueprint))).toEqual(
                    expect.arrayContaining(["blueprint-reelstripgeneration-invalid-constraint-field", "blueprint-reelstripgeneration-unknown-symbol"]),
                );
            });

            it("flags an empty or unknown-symbol sequence (requiredSequence)", () => {
                const entry = generatedEntry({constraints: [{type: "requiredSequence", sequence: ["ZZ"]}]});
                const blueprint = {...validBlueprint(), reelStripGeneration: new Array(5).fill(entry)};

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstripgeneration-unknown-symbol");
            });

            it("flags maximumOccurrences below minimumOccurrences (requiredSequence)", () => {
                const entry = generatedEntry({
                    constraints: [{type: "requiredSequence", sequence: ["A", "K"], minimumOccurrences: 3, maximumOccurrences: 1}],
                });
                const blueprint = {...validBlueprint(), reelStripGeneration: new Array(5).fill(entry)};

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstripgeneration-invalid-occurrences-range");
            });

            it("accepts a fully valid constraints array across every constraint type", () => {
                const entry = generatedEntry({
                    constraints: [
                        {type: "minimumCircularDistance", minimumDistance: 2, symbolIds: ["W"]},
                        {type: "maximumCircularDistance", maximumDistance: 10, symbolIds: ["W"]},
                        {type: "maximumConsecutiveOccurrences", maximumConsecutive: 3},
                        {type: "forbiddenAdjacency", pairs: [["W", "W"]]},
                        {type: "requiredAdjacency", pairs: [["W", "A"]], directed: true},
                        {type: "forbiddenSequence", sequence: ["W", "W", "W"]},
                        {type: "requiredSequence", sequence: ["A", "K"], minimumOccurrences: 0, maximumOccurrences: 5},
                    ],
                });
                const blueprint = {...validBlueprint(), reelStripGeneration: new Array(5).fill(entry)};

                expect(validator.validate(blueprint).filter((issue) => issue.severity === "error")).toEqual([]);
            });
        });
    });

    it("flags a non-positive availableBets entry", () => {
        const blueprint = {...validBlueprint(), availableBets: [1, 0, -5]};

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-availablebets-invalid");
    });

    it("flags duplicate values in availableBets", () => {
        const blueprint = {...validBlueprint(), availableBets: [1, 2, 2, 5]};

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-availablebets-duplicate")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("flags duplicate ids within wilds/scatters", () => {
        expect(codesOf(validator.validate({...validBlueprint(), wilds: ["W", "W"]}))).toContain(
            "blueprint-wilds-duplicate",
        );
        expect(codesOf(validator.validate({...validBlueprint(), scatters: ["S", "S"]}))).toContain(
            "blueprint-scatters-duplicate",
        );
    });

    it("flags a symbol listed as both a wild and a scatter", () => {
        const blueprint = {...validBlueprint(), scatters: ["W", "S"]};

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-wilds-scatters-overlap");
    });

    it("flags a paytable entry that pays less for more matches than for fewer matches", () => {
        const blueprint = {...validBlueprint(), paytable: {...validBlueprint().paytable, A: {3: 10, 4: 5, 5: 20}}};

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-paytable-non-monotonic")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("flags a duplicate payline", () => {
        const blueprint = {
            ...validBlueprint(),
            paylines: [
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
            ],
        };

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-paylines-duplicate")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("flags a reel strip shorter than rows as suspicious (guaranteed repeats)", () => {
        const blueprint = {
            ...validBlueprint(),
            reelStrips: [
                ["A", "K"],
                ["Q", "J"],
                ["W", "S"],
                ["A", "K"],
                ["Q", "J"],
            ],
        };

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-reelstrip-too-short")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("flags a paytable/wild/scatter symbol that never appears in explicit reelStrips", () => {
        const blueprint = {
            ...validBlueprint(),
            reelStrips: new Array(5).fill(["A", "K", "Q", "W", "S"]), // missing "J", which has a paytable entry
        };

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstrips-missing-symbol");
    });

    it("flags a paytable/wild/scatter symbol that never appears in explicit symbolWeights", () => {
        const blueprint = {
            ...validBlueprint(),
            symbolWeights: {A: 10, K: 10, Q: 10, J: 10, W: 3}, // missing "S", the scatter
        };

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-symbolweights-missing-symbol");
    });

    it("flags a non-wild/scatter symbol with no paytable entry", () => {
        const blueprint = {...validBlueprint(), paytable: {A: {3: 5}}};

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-symbol-missing-payout")?.severity).toBe("warning");
    });

    it("flags unusually large reels/rows counts as suspicious, not as an error", () => {
        const blueprint = {...validBlueprint(), reels: 12, rows: 11} as Partial<GameBlueprint>;
        Reflect.deleteProperty(blueprint, "paylines");

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-reels-suspicious")?.severity).toBe("warning");
        expect(issues.find((issue) => issue.code === "blueprint-rows-suspicious")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("warns about a non-scatter payout at 2 matching symbols as unusually frequent", () => {
        const blueprint = {...validBlueprint(), paytable: {...validBlueprint().paytable, A: {2: 3, 3: 5, 4: 10, 5: 20}}};

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-paytable-frequent-low-match")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("warns about a non-scatter symbol with no 3-of-a-kind payout", () => {
        const blueprint = {...validBlueprint(), paytable: {...validBlueprint().paytable, A: {4: 10, 5: 20}}};

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-paytable-missing-base-payout")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("warns about an unusually generous entry-tier payout", () => {
        const blueprint = {...validBlueprint(), paytable: {...validBlueprint().paytable, A: {3: 50, 4: 60, 5: 70}}};

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-paytable-generous-entry-payout")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("warns when every non-scatter symbol pays the same top multiplier (no low/high-pay tiering)", () => {
        const blueprint = {
            ...validBlueprint(),
            paytable: {
                A: {3: 5, 4: 8, 5: 20},
                K: {3: 5, 4: 8, 5: 20},
                Q: {3: 5, 4: 8, 5: 20},
                J: {3: 5, 4: 8, 5: 20},
                S: {3: 2, 4: 5, 5: 10},
            },
        };

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-paytable-no-tiering")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("does not apply line-pay entry/tiering checks to scatter symbols", () => {
        const blueprint = {...validBlueprint(), paytable: {...validBlueprint().paytable, S: {2: 50, 4: 70, 5: 100}}};

        expect(codesOf(validator.validate(blueprint))).toEqual(
            expect.not.arrayContaining([
                "blueprint-paytable-frequent-low-match",
                "blueprint-paytable-missing-base-payout",
                "blueprint-paytable-generous-entry-payout",
            ]),
        );
    });

    it("warns when a single symbol dominates symbolWeights", () => {
        const blueprint = {...validBlueprint(), symbolWeights: {A: 1, K: 1, Q: 1, J: 1, W: 1, S: 50}};

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-weighting-dominant-symbol")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("warns when a single symbol dominates explicit reelStrips", () => {
        const blueprint = {...validBlueprint(), reelStrips: new Array(5).fill(["A", "A", "A", "A", "K", "Q", "J", "W", "S"])};

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-weighting-dominant-symbol")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("warns when a wild is at least as common as the average regular symbol", () => {
        const blueprint = {...validBlueprint(), symbolWeights: {A: 10, K: 10, Q: 10, J: 10, W: 10, S: 2}};

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-weighting-wild-too-common")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("warns when a higher-paying symbol isn't rarer than a lower-paying one", () => {
        const blueprint = {...validBlueprint(), symbolWeights: {A: 10, K: 10, Q: 10, J: 10, W: 3, S: 2}};

        const issues = validator.validate(blueprint);
        const mismatches = issues.filter((issue) => issue.code === "blueprint-weighting-pay-mismatch");
        expect(mismatches.length).toBeGreaterThan(0);
        expect(mismatches.every((issue) => issue.severity === "warning")).toBe(true);
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("does not warn about weighting when payout is properly tiered by rarity", () => {
        const blueprint = {...validBlueprint(), symbolWeights: {A: 2, K: 4, Q: 6, J: 8, W: 1, S: 1}};

        expect(codesOf(validator.validate(blueprint))).toEqual(
            expect.not.arrayContaining([
                "blueprint-weighting-dominant-symbol",
                "blueprint-weighting-wild-too-common",
                "blueprint-weighting-pay-mismatch",
            ]),
        );
    });

    describe("winModel", () => {
        it("accepts an absent winModel, and each of lines/ways/clusters", () => {
            expect(validator.validate(validBlueprint()).filter((issue) => issue.severity === "error")).toEqual([]);
            expect(
                validator
                    .validate({...validBlueprint(), winModel: {type: "lines"}})
                    .filter((issue) => issue.severity === "error"),
            ).toEqual([]);
            expect(
                validator
                    .validate({...validBlueprint(), paylines: undefined, winModel: {type: "ways"}})
                    .filter((issue) => issue.severity === "error"),
            ).toEqual([]);
            expect(
                validator
                    .validate({...validBlueprint(), paylines: undefined, winModel: {type: "clusters", minimumClusterSize: 4}})
                    .filter((issue) => issue.severity === "error"),
            ).toEqual([]);
        });

        it("flags an invalid winModel.type", () => {
            const blueprint = {...validBlueprint(), winModel: {type: "not-a-type"}} as unknown as GameBlueprint;

            expect(codesOf(validator.validate(blueprint))).toContain("blueprint-winmodel-invalid-type");
        });

        it("flags an invalid minimumClusterSize", () => {
            const blueprint = {...validBlueprint(), paylines: undefined, winModel: {type: "clusters", minimumClusterSize: 1}};

            expect(codesOf(validator.validate(blueprint))).toContain("blueprint-winmodel-invalid-minimumclustersize");
        });

        it("warns when paylines is set alongside a ways/clusters winModel", () => {
            const blueprint = {...validBlueprint(), winModel: {type: "ways"}};

            const issues = validator.validate(blueprint);
            expect(issues.find((issue) => issue.code === "blueprint-winmodel-paylines-ignored")?.severity).toBe("warning");
        });
    });

    describe("mechanics.freeGames", () => {
        function withFreeGames(overrides: Record<string, unknown> = {}) {
            return {
                ...validBlueprint(),
                mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8, 4: 15, 5: 20}, ...overrides}},
            };
        }

        it("accepts a well-formed freeGames config", () => {
            expect(validator.validate(withFreeGames()).filter((issue) => issue.severity === "error")).toEqual([]);
        });

        it("flags a missing/non-string scatterSymbol", () => {
            expect(codesOf(validator.validate(withFreeGames({scatterSymbol: ""})))).toContain(
                "blueprint-mechanics-freegames-missing-scatter",
            );
        });

        it("flags a scatterSymbol not listed in scatters", () => {
            expect(codesOf(validator.validate(withFreeGames({scatterSymbol: "ZZ"})))).toContain(
                "blueprint-mechanics-freegames-unknown-scatter",
            );
        });

        it("flags an empty awardsByCount", () => {
            expect(codesOf(validator.validate(withFreeGames({awardsByCount: {}})))).toContain(
                "blueprint-mechanics-freegames-empty-awards",
            );
        });

        it("flags an invalid match-count key and a non-positive award", () => {
            const blueprint = withFreeGames({awardsByCount: {1: 5, 3: 0}});

            expect(codesOf(validator.validate(blueprint))).toEqual(
                expect.arrayContaining(["blueprint-mechanics-freegames-invalid-count", "blueprint-mechanics-freegames-invalid-award"]),
            );
        });

        it("flags a non-object mechanics", () => {
            const blueprint = {...validBlueprint(), mechanics: "nope"} as unknown as GameBlueprint;

            expect(codesOf(validator.validate(blueprint))).toContain("blueprint-mechanics-invalid");
        });
    });

    describe("betModes", () => {
        it("accepts well-formed bet modes", () => {
            const blueprint = {
                ...validBlueprint(),
                betModes: [{id: "base"}, {id: "buy-free-spins", label: "Buy Free Spins", costMultiplier: 100}],
                mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8}}},
            };

            expect(validator.validate(blueprint).filter((issue) => issue.severity === "error")).toEqual([]);
        });

        it("flags a non-array betModes", () => {
            const blueprint = {...validBlueprint(), betModes: "nope"} as unknown as GameBlueprint;

            expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmodes-invalid");
        });

        it("flags a missing/empty bet mode id", () => {
            const blueprint = {...validBlueprint(), betModes: [{id: ""}]};

            expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmode-invalid-id");
        });

        it("flags duplicate bet mode ids", () => {
            const blueprint = {...validBlueprint(), betModes: [{id: "base"}, {id: "base"}]};

            expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmodes-duplicate-id");
        });

        it("flags an invalid costMultiplier", () => {
            const blueprint = {...validBlueprint(), betModes: [{id: "base", costMultiplier: -5}]};

            expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmode-invalid-costmultiplier");
        });

        // BetMode intentionally has no "forces free games entry" (or similar behavior-promising) field
        // -- see BetMode.ts's own doc comment for why. A stray "forcesFreeGames" key some older/hand-
        // written blueprint might still carry is just inert extra data on the entry, same as any other
        // unrecognized property elsewhere on the blueprint -- never specifically flagged.
        it("does not flag a stray forcesFreeGames-shaped property on a bet mode entry", () => {
            const blueprint = {...validBlueprint(), betModes: [{id: "buy", forcesFreeGames: true}]};

            expect(codesOf(validator.validate(blueprint))).toEqual(
                expect.not.arrayContaining([
                    "blueprint-betmode-invalid-forcesfreegames",
                    "blueprint-betmode-forces-freegames-without-mechanics",
                ]),
            );
        });

        describe("explicit runtime-semantics contract (runtimeType/isDefault/forcedFreeGames)", () => {
            it("accepts a fully-determined base + persistent ante contract", () => {
                const blueprint = {
                    ...validBlueprint(),
                    betModes: [
                        {id: "base", runtimeType: "base", isDefault: true},
                        {id: "ante", runtimeType: "ante", costMultiplier: 1.25},
                    ],
                };

                expect(validator.validate(blueprint).filter((issue) => issue.severity === "error")).toEqual([]);
            });

            it("accepts a fully-determined base + one-shot buy-feature contract, alongside mechanics.freeGames", () => {
                const blueprint = {
                    ...validBlueprint(),
                    betModes: [
                        {id: "base", runtimeType: "base", isDefault: true},
                        {id: "buy-bonus", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 10},
                    ],
                    mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8}}},
                };

                expect(validator.validate(blueprint).filter((issue) => issue.severity === "error")).toEqual([]);
            });

            it("flags an incomplete opt-in: some modes set runtimeType, others don't", () => {
                const blueprint = {
                    ...validBlueprint(),
                    betModes: [{id: "base", runtimeType: "base", isDefault: true}, {id: "legacy"}],
                };

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmodes-incomplete-runtimetype");
            });

            it("flags isDefault/forcedFreeGames used without any runtimeType at all", () => {
                const blueprint = {...validBlueprint(), betModes: [{id: "base", isDefault: true}]};

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmode-runtimetype-required");
            });

            it("flags an invalid runtimeType value", () => {
                const blueprint = {...validBlueprint(), betModes: [{id: "base", runtimeType: "bogus", isDefault: true}]};

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmode-invalid-runtimetype");
            });

            it("flags zero default modes", () => {
                const blueprint = {...validBlueprint(), betModes: [{id: "base", runtimeType: "base"}]};

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmodes-missing-default");
            });

            it("flags more than one default mode", () => {
                const blueprint = {
                    ...validBlueprint(),
                    betModes: [
                        {id: "base", runtimeType: "base", isDefault: true},
                        {id: "ante", runtimeType: "ante", costMultiplier: 1.25, isDefault: true},
                    ],
                };

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmodes-multiple-defaults");
            });

            it("flags a buyFeature mode marked as the default", () => {
                const blueprint = {
                    ...validBlueprint(),
                    betModes: [{id: "buy-bonus", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 10, isDefault: true}],
                    mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8}}},
                };

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmodes-default-is-buyfeature");
            });

            it("flags an ante mode with no costMultiplier", () => {
                const blueprint = {
                    ...validBlueprint(),
                    betModes: [
                        {id: "base", runtimeType: "base", isDefault: true},
                        {id: "ante", runtimeType: "ante"},
                    ],
                };

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmode-ante-missing-costmultiplier");
            });

            it("flags a base mode with a costMultiplier other than 1", () => {
                const blueprint = {
                    ...validBlueprint(),
                    betModes: [{id: "base", runtimeType: "base", isDefault: true, costMultiplier: 2}],
                };

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmode-base-invalid-costmultiplier");
            });

            it("flags a buyFeature mode with no costMultiplier", () => {
                const blueprint = {
                    ...validBlueprint(),
                    betModes: [
                        {id: "base", runtimeType: "base", isDefault: true},
                        {id: "buy-bonus", runtimeType: "buyFeature", forcedFreeGames: 10},
                    ],
                    mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8}}},
                };

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmode-buyfeature-missing-costmultiplier");
            });

            it("flags a buyFeature mode with no forcedFreeGames", () => {
                const blueprint = {
                    ...validBlueprint(),
                    betModes: [
                        {id: "base", runtimeType: "base", isDefault: true},
                        {id: "buy-bonus", runtimeType: "buyFeature", costMultiplier: 100},
                    ],
                    mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8}}},
                };

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmode-buyfeature-missing-forcedfreegames");
            });

            it("flags forcedFreeGames set on a non-buyFeature mode", () => {
                const blueprint = {
                    ...validBlueprint(),
                    betModes: [{id: "base", runtimeType: "base", isDefault: true, forcedFreeGames: 5}],
                };

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmode-forcedfreegames-not-buyfeature");
            });

            it("flags a non-positive-integer forcedFreeGames", () => {
                const blueprint = {
                    ...validBlueprint(),
                    betModes: [
                        {id: "base", runtimeType: "base", isDefault: true},
                        {id: "buy-bonus", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 0},
                    ],
                    mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8}}},
                };

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmode-invalid-forcedfreegames");
            });

            it("flags more than one buyFeature mode", () => {
                const blueprint = {
                    ...validBlueprint(),
                    betModes: [
                        {id: "base", runtimeType: "base", isDefault: true},
                        {id: "buy-10", runtimeType: "buyFeature", costMultiplier: 50, forcedFreeGames: 10},
                        {id: "buy-20", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 20},
                    ],
                    mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8}}},
                };

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmodes-multiple-buyfeature");
            });

            it("flags a buyFeature mode when mechanics.freeGames isn't configured", () => {
                const blueprint = {
                    ...validBlueprint(),
                    betModes: [
                        {id: "base", runtimeType: "base", isDefault: true},
                        {id: "buy-bonus", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 10},
                    ],
                };

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmodes-buyfeature-requires-freegames");
            });

            it("flags an invalid isDefault type", () => {
                const blueprint = {...validBlueprint(), betModes: [{id: "base", runtimeType: "base", isDefault: "yes"}]};

                expect(codesOf(validator.validate(blueprint))).toContain("blueprint-betmode-invalid-isdefault");
            });
        });
    });
});
