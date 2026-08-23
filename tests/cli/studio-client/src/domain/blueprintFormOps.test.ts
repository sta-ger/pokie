import {
    addBet,
    addBetMode,
    addFreeGames,
    addPayline,
    applyPaylineSet,
    addReelStripGenerationLiteralSymbol,
    addReelStripSymbol,
    addSymbol,
    applyReelStripGenerationEntry,
    computeReelStripGenerationAutoLength,
    duplicateBetAt,
    duplicateBetModeAt,
    duplicatePaylineAt,
    duplicatePaytablePayout,
    duplicateReelStripGenerationLiteralSymbolAt,
    duplicateReelStripSymbolAt,
    duplicateSymbolAt,
    getReelGenerationMode,
    getSymbolDeletionBlockers,
    getReelStripGenerationSourceMode,
    moveBetAt,
    moveBetModeAt,
    movePaylineAt,
    moveReelStripGenerationLiteralSymbolAt,
    moveReelStripSymbolAt,
    moveSymbolAt,
    parseReelStripGenerationConstraintsJson,
    readFreeGames,
    removeBetAt,
    removeBetModeAt,
    removeFreeGames,
    removeFreeGamesAward,
    removePaylineAt,
    removePaytablePayout,
    removeReelStripGenerationLiteralSymbolAt,
    removeReelStripGenerationLockedPosition,
    removeReelStripGenerationSymbolCount,
    removeReelStripGenerationSymbolWeight,
    removeReelStripSymbolAt,
    removeSymbolAt,
    renameSymbol,
    removeSymbolWeight,
    resizePaylinesToReelCount,
    resizeReelStripGenerationToReelCount,
    resizeReelStripsToReelCount,
    setBetAt,
    setFreeGamesAward,
    setFreeGamesScatterSymbol,
    setPaylineCell,
    setPaytablePayout,
    setReelGenerationMode,
    setReelStripGenerationConstraints,
    setReelStripGenerationEntryType,
    setReelStripGenerationLength,
    setReelStripGenerationLiteralSymbolAt,
    setReelStripGenerationLockedPosition,
    setReelStripGenerationMaxAttempts,
    setReelStripGenerationSeed,
    setReelStripGenerationSourceMode,
    setReelStripGenerationSymbolCount,
    setReelStripGenerationSymbolWeight,
    setReelStripSymbolAt,
    setSymbolAt,
    setSymbolWeight,
    toggleScatterSymbol,
    toggleWildSymbol,
    updateBetMode,
    type ReelStripGenerationDrafts,
} from "../../../../../cli/studio-client/src/domain/blueprintFormOps";

describe("blueprintFormOps", () => {
    describe("symbols", () => {
        it("adds, sets, removes, duplicates, and moves symbols", () => {
            const b: Record<string, unknown> = {symbols: ["A", "B"]};

            addSymbol(b, "C");
            expect(b.symbols).toEqual(["A", "B", "C"]);

            setSymbolAt(b, 0, "AA");
            expect(b.symbols).toEqual(["AA", "B", "C"]);

            moveSymbolAt(b, 2, 0);
            expect(b.symbols).toEqual(["C", "AA", "B"]);

            removeSymbolAt(b, 1);
            expect(b.symbols).toEqual(["C", "B"]);
        });

        it("duplicates a symbol with a unique id suffix", () => {
            const b: Record<string, unknown> = {symbols: ["A", "A-copy"]};

            duplicateSymbolAt(b, 0);

            expect(b.symbols).toEqual(["A", "A-copy-2", "A-copy"]);
        });

        it("toggles wild/scatter membership", () => {
            const b: Record<string, unknown> = {symbols: ["A"]};

            toggleWildSymbol(b, "A");
            expect(b.wilds).toEqual(["A"]);
            toggleWildSymbol(b, "A");
            expect(b.wilds).toEqual([]);

            toggleScatterSymbol(b, "A");
            expect(b.scatters).toEqual(["A"]);
            expect(b.wilds).toEqual([]);
        });

        it("renames every known symbol reference rather than leaving a broken Blueprint", () => {
            const b: Record<string, unknown> = {
                symbols: ["A", "S"], wilds: ["A"], scatters: ["S"], paytable: {A: {"3": 5}},
                reelStrips: [["A", "S"]], symbolWeights: {A: 2},
                mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {"3": 10}}},
                reelStripGeneration: [{type: "generated", length: 2, seed: 1, symbolCounts: {A: 2}, lockedPositions: {"0": "A"}, constraints: [{type: "minimumCircularDistance", minimumDistance: 2, symbolIds: ["A"]}]}],
            };

            expect(renameSymbol(b, "A", "K")).toBeUndefined();

            expect(b.symbols).toEqual(["K", "S"]);
            expect(b.wilds).toEqual(["K"]);
            expect(b.paytable).toEqual({K: {"3": 5}});
            expect(b.reelStrips).toEqual([["K", "S"]]);
            expect(b.symbolWeights).toEqual({K: 2});
            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 2, seed: 1, symbolCounts: {K: 2}, lockedPositions: {"0": "K"}, constraints: [{type: "minimumCircularDistance", minimumDistance: 2, symbolIds: ["K"]}]}]);
            expect(b.mechanics).toEqual({freeGames: {scatterSymbol: "S", awardsByCount: {"3": 10}}});
        });

        it("blocks deletion with the exact dependent locations, but removes an unreferenced symbol", () => {
            const b: Record<string, unknown> = {symbols: ["A", "B"], wilds: ["B"], reelStrips: [["A"]], paytable: {A: {"3": 5}}};

            expect(getSymbolDeletionBlockers(b, "A")).toEqual(["paytable", "reelStrips[0]"]);
            removeSymbolAt(b, 0);
            expect(b.symbols).toEqual(["A", "B"]);

            removeSymbolAt(b, 1);
            expect(b.symbols).toEqual(["A"]);
            expect(b.wilds).toEqual([]);
        });

        it("tolerates a missing/malformed symbols field", () => {
            const b: Record<string, unknown> = {};
            addSymbol(b, "A");
            expect(b.symbols).toEqual(["A"]);
        });
    });

    describe("availableBets", () => {
        it("adds, sets, removes, duplicates, and moves bets", () => {
            const b: Record<string, unknown> = {availableBets: [1, 2]};

            addBet(b, 5);
            expect(b.availableBets).toEqual([1, 2, 5]);

            setBetAt(b, 0, 10);
            expect(b.availableBets).toEqual([10, 2, 5]);

            duplicateBetAt(b, 1);
            expect(b.availableBets).toEqual([10, 2, 2, 5]);

            moveBetAt(b, 3, 0);
            expect(b.availableBets).toEqual([5, 10, 2, 2]);

            removeBetAt(b, 0);
            expect(b.availableBets).toEqual([10, 2, 2]);
        });
    });

    describe("betModes", () => {
        it("adds, edits, duplicates, reorders, and removes persisted mode definitions", () => {
            const b: Record<string, unknown> = {};

            addBetMode(b);
            updateBetMode(b, 0, {id: "base", label: "Base", runtimeType: "base", isDefault: true, costMultiplier: 1});
            duplicateBetModeAt(b, 0);
            moveBetModeAt(b, 1, 0);
            removeBetModeAt(b, 1);

            expect(b.betModes).toEqual([{id: "base-copy", label: "Base", runtimeType: "base", isDefault: false, costMultiplier: 1}]);
        });
    });

    describe("paylines", () => {
        it("adds a payline sized to the current reel count", () => {
            const b: Record<string, unknown> = {reels: 3};

            addPayline(b);

            expect(b.paylines).toEqual([[0, 0, 0]]);
        });

        it("sets a single cell, duplicates, removes, and moves lines", () => {
            const b: Record<string, unknown> = {reels: 3, paylines: [[0, 0, 0], [1, 1, 1]]};

            setPaylineCell(b, 0, 1, 2);
            expect(b.paylines).toEqual([[0, 2, 0], [1, 1, 1]]);

            duplicatePaylineAt(b, 0);
            expect(b.paylines).toEqual([[0, 2, 0], [0, 2, 0], [1, 1, 1]]);

            movePaylineAt(b, 2, 0);
            expect(b.paylines).toEqual([[1, 1, 1], [0, 2, 0], [0, 2, 0]]);

            removePaylineAt(b, 0);
            expect(b.paylines).toEqual([[0, 2, 0], [0, 2, 0]]);
        });

        it("pads or truncates every line when reel count changes", () => {
            const b: Record<string, unknown> = {reels: 5, paylines: [[0, 0, 0]]};

            resizePaylinesToReelCount(b);

            expect(b.paylines).toEqual([[0, 0, 0, 0, 0]]);
        });

        describe("applyPaylineSet", () => {
            it("replace swaps the whole list for the incoming lines", () => {
                const b: Record<string, unknown> = {reels: 3, paylines: [[0, 2, 0]]};

                applyPaylineSet(b, [[1, 1, 1], [0, 0, 0]], "replace");

                expect(b.paylines).toEqual([[1, 1, 1], [0, 0, 0]]);
            });

            it("append adds the incoming lines after whatever is already there, never dropping existing manual lines", () => {
                const b: Record<string, unknown> = {reels: 3, paylines: [[0, 2, 0]]};

                applyPaylineSet(b, [[1, 1, 1], [0, 0, 0]], "append");

                expect(b.paylines).toEqual([[0, 2, 0], [1, 1, 1], [0, 0, 0]]);
            });

            it("append onto an absent paylines field starts from an empty list", () => {
                const b: Record<string, unknown> = {reels: 3};

                applyPaylineSet(b, [[1, 1, 1]], "append");

                expect(b.paylines).toEqual([[1, 1, 1]]);
            });

            it("doesn't alias the incoming lines array -- later mutation of the source doesn't affect the blueprint", () => {
                const b: Record<string, unknown> = {reels: 3};
                const incoming = [[1, 1, 1]];

                applyPaylineSet(b, incoming, "replace");
                incoming[0][0] = 9;

                expect(b.paylines).toEqual([[1, 1, 1]]);
            });
        });
    });

    describe("paytable", () => {
        it("sets, removes, and duplicates payouts", () => {
            const b: Record<string, unknown> = {paytable: {}};

            setPaytablePayout(b, "A", 3, 5);
            setPaytablePayout(b, "A", 4, 10);
            expect(b.paytable).toEqual({A: {"3": 5, "4": 10}});

            duplicatePaytablePayout(b, "A", 3, 5);
            expect(b.paytable).toEqual({A: {"3": 5, "4": 10, "5": 5}});

            removePaytablePayout(b, "A", 4);
            expect(b.paytable).toEqual({A: {"3": 5, "5": 5}});
        });

        it("removes the symbol entirely once its last payout entry is removed", () => {
            const b: Record<string, unknown> = {paytable: {A: {"3": 5}}};

            removePaytablePayout(b, "A", 3);

            expect(b.paytable).toEqual({});
        });
    });

    describe("mechanics (scatter-triggered free games)", () => {
        it("reports no free games configured until addFreeGames turns the mechanic on", () => {
            const b: Record<string, unknown> = {scatters: ["S"]};

            expect(readFreeGames(b)).toBeUndefined();

            addFreeGames(b);

            expect(readFreeGames(b)).toEqual({scatterSymbol: "S", awardsByCount: {}});
        });

        it("sets the scatter symbol and awards, independent of each other", () => {
            const b: Record<string, unknown> = {};
            addFreeGames(b);

            setFreeGamesScatterSymbol(b, "S");
            setFreeGamesAward(b, 3, 10);
            setFreeGamesAward(b, 4, 15);

            expect(readFreeGames(b)).toEqual({scatterSymbol: "S", awardsByCount: {"3": 10, "4": 15}});
        });

        it("removes just one award entry, leaving the rest and the scatter symbol untouched", () => {
            const b: Record<string, unknown> = {};
            addFreeGames(b);
            setFreeGamesScatterSymbol(b, "S");
            setFreeGamesAward(b, 3, 10);
            setFreeGamesAward(b, 4, 15);

            removeFreeGamesAward(b, 3);

            expect(readFreeGames(b)).toEqual({scatterSymbol: "S", awardsByCount: {"4": 15}});
        });

        it("turns the mechanic off outright, not just clearing its fields", () => {
            const b: Record<string, unknown> = {mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {"3": 10}}}};

            removeFreeGames(b);

            expect(readFreeGames(b)).toBeUndefined();
            expect(b.mechanics).toEqual({});
        });

        it("tolerates a missing/malformed mechanics field", () => {
            const b: Record<string, unknown> = {mechanics: "not an object"};

            expect(readFreeGames(b)).toBeUndefined();

            setFreeGamesScatterSymbol(b, "S");

            expect(readFreeGames(b)).toEqual({scatterSymbol: "S", awardsByCount: {}});
        });
    });

    describe("reelStrips", () => {
        it("adds, sets, removes, duplicates, and moves symbols on a specific reel", () => {
            const b: Record<string, unknown> = {reelStrips: [["A"], ["B"]]};

            addReelStripSymbol(b, 0, "C");
            expect(b.reelStrips).toEqual([["A", "C"], ["B"]]);

            setReelStripSymbolAt(b, 0, 1, "D");
            expect(b.reelStrips).toEqual([["A", "D"], ["B"]]);

            duplicateReelStripSymbolAt(b, 0, 0);
            expect(b.reelStrips).toEqual([["A", "A", "D"], ["B"]]);

            moveReelStripSymbolAt(b, 0, 2, 0);
            expect(b.reelStrips).toEqual([["D", "A", "A"], ["B"]]);

            removeReelStripSymbolAt(b, 0, 0);
            expect(b.reelStrips).toEqual([["A", "A"], ["B"]]);
        });

        it("keeps the outer array length in sync with reels", () => {
            const b: Record<string, unknown> = {reels: 3, reelStrips: [["A"]]};

            resizeReelStripsToReelCount(b);

            expect(b.reelStrips).toEqual([["A"], [], []]);
        });

        it("does nothing when reelStrips isn't present", () => {
            const b: Record<string, unknown> = {reels: 3};

            resizeReelStripsToReelCount(b);

            expect(b.reelStrips).toBeUndefined();
        });
    });

    describe("symbolWeights", () => {
        it("sets and removes weights", () => {
            const b: Record<string, unknown> = {symbolWeights: {A: 4}};

            setSymbolWeight(b, "B", 6);
            expect(b.symbolWeights).toEqual({A: 4, B: 6});

            removeSymbolWeight(b, "A");
            expect(b.symbolWeights).toEqual({B: 6});
        });
    });

    describe("reelStripGeneration", () => {
        it("switches a reel's own entry between literal and generated, seeding defaults on a brand-new entry", () => {
            const b: Record<string, unknown> = {reelStripGeneration: [{type: "literal", strip: ["A"]}]};
            const drafts: ReelStripGenerationDrafts = new Map();

            setReelStripGenerationEntryType(b, drafts, 0, "generated");
            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 1, seed: 1, symbolCounts: {}}]);

            setReelStripGenerationEntryType(b, drafts, 0, "literal");
            expect(b.reelStripGeneration).toEqual([{type: "literal", strip: ["A"]}]);
        });

        it("is a no-op when the requested type already matches the reel's current type", () => {
            const b: Record<string, unknown> = {reelStripGeneration: [{type: "generated", length: 3, seed: 9, symbolCounts: {A: 3}}]};
            const drafts: ReelStripGenerationDrafts = new Map();

            setReelStripGenerationEntryType(b, drafts, 0, "generated");

            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 3, seed: 9, symbolCounts: {A: 3}}]);
        });

        it("does not lose a literal strip or a generated config across repeated literal <-> generated switches, and the blueprint stays clean", () => {
            const b: Record<string, unknown> = {
                reelStripGeneration: [{type: "generated", length: 5, seed: 7, symbolCounts: {A: 2, B: 3}, maxAttempts: 20}],
            };
            const drafts: ReelStripGenerationDrafts = new Map();

            setReelStripGenerationEntryType(b, drafts, 0, "literal");
            expect(b.reelStripGeneration).toEqual([{type: "literal", strip: []}]);
            addReelStripGenerationLiteralSymbol(b, 0, "A");
            addReelStripGenerationLiteralSymbol(b, 0, "B");

            setReelStripGenerationEntryType(b, drafts, 0, "generated");
            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 5, seed: 7, symbolCounts: {A: 2, B: 3}, maxAttempts: 20}]);

            setReelStripGenerationEntryType(b, drafts, 0, "literal");
            expect(b.reelStripGeneration).toEqual([{type: "literal", strip: ["A", "B"]}]);
        });

        it("does nothing for an out-of-range reel index", () => {
            const b: Record<string, unknown> = {reelStripGeneration: [{type: "literal", strip: ["A"]}]};
            const drafts: ReelStripGenerationDrafts = new Map();

            setReelStripGenerationEntryType(b, drafts, 5, "generated");

            expect(b.reelStripGeneration).toEqual([{type: "literal", strip: ["A"]}]);
        });

        it("adds, sets, removes, duplicates, and moves symbols on a literal reel's own strip", () => {
            const b: Record<string, unknown> = {
                reelStripGeneration: [{type: "literal", strip: ["A"]}, {type: "literal", strip: ["B"]}],
            };

            addReelStripGenerationLiteralSymbol(b, 0, "C");
            expect(b.reelStripGeneration).toEqual([{type: "literal", strip: ["A", "C"]}, {type: "literal", strip: ["B"]}]);

            setReelStripGenerationLiteralSymbolAt(b, 0, 1, "D");
            duplicateReelStripGenerationLiteralSymbolAt(b, 0, 0);
            moveReelStripGenerationLiteralSymbolAt(b, 0, 2, 0);
            removeReelStripGenerationLiteralSymbolAt(b, 0, 0);

            expect((b.reelStripGeneration as Array<{strip: string[]}>)[0].strip).toEqual(["A", "A"]);
        });

        it("sets length, seed, and maxAttempts on a generated reel", () => {
            const b: Record<string, unknown> = {reelStripGeneration: [{type: "generated", length: 1, seed: 1, symbolCounts: {}}]};

            setReelStripGenerationLength(b, 0, 10);
            setReelStripGenerationSeed(b, 0, 42);
            setReelStripGenerationMaxAttempts(b, 0, 50);

            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 10, seed: 42, maxAttempts: 50, symbolCounts: {}}]);

            setReelStripGenerationMaxAttempts(b, 0, undefined);
            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 10, seed: 42, symbolCounts: {}}]);
        });

        it("reports the current source mode", () => {
            expect(getReelStripGenerationSourceMode({type: "generated", symbolCounts: {A: 3}})).toBe("symbolCounts");
            expect(getReelStripGenerationSourceMode({type: "generated", symbolWeights: {A: 3}})).toBe("symbolWeights");
        });

        it("is a no-op when the requested source mode already matches the reel's current mode", () => {
            const b: Record<string, unknown> = {reelStripGeneration: [{type: "generated", length: 1, seed: 1, symbolCounts: {A: 3}}]};
            const drafts: ReelStripGenerationDrafts = new Map();

            setReelStripGenerationSourceMode(b, drafts, 0, "symbolCounts");

            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 1, seed: 1, symbolCounts: {A: 3}}]);
        });

        describe("computeReelStripGenerationAutoLength", () => {
            it("sums the active symbolCounts", () => {
                expect(computeReelStripGenerationAutoLength({type: "generated", symbolCounts: {A: 3, B: 5}})).toBe(8);
            });

            it("sums and rounds the active symbolWeights", () => {
                expect(computeReelStripGenerationAutoLength({type: "generated", symbolWeights: {A: 1.5, B: 2.6}})).toBe(4);
            });

            it("returns undefined when the active side is empty", () => {
                expect(computeReelStripGenerationAutoLength({type: "generated", symbolCounts: {}})).toBeUndefined();
            });
        });

        it("does not lose a side's own data across repeated symbolCounts <-> symbolWeights switches, and the blueprint entry stays clean (no draft keys, no both-sides-set)", () => {
            const entry = {type: "generated", length: 1, seed: 1, symbolCounts: {A: 3}};
            const b: Record<string, unknown> = {reelStripGeneration: [entry]};
            const drafts: ReelStripGenerationDrafts = new Map();

            // First visit to Weights has nothing to restore yet -- starts empty, exactly like a
            // brand-new generated entry would.
            setReelStripGenerationSourceMode(b, drafts, 0, "symbolWeights");
            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 1, seed: 1, symbolWeights: {}}]);

            setReelStripGenerationSymbolWeight(b, 0, "A", 5);

            // Switching back to Counts restores the original {A: 3} instead of resetting to {}, and
            // the entry itself never carries both symbolCounts and symbolWeights, or any extra key.
            setReelStripGenerationSourceMode(b, drafts, 0, "symbolCounts");
            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 1, seed: 1, symbolCounts: {A: 3}}]);
            expect(Object.keys((b.reelStripGeneration as Record<string, unknown>[])[0]).sort()).toEqual(["length", "seed", "symbolCounts", "type"]);

            // And switching back to Weights restores {A: 5}, not another reset to {}.
            setReelStripGenerationSourceMode(b, drafts, 0, "symbolWeights");
            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 1, seed: 1, symbolWeights: {A: 5}}]);
        });

        it("keeps two different toggle histories that end at the same active config byte-identical (drafts never leak into the blueprint or its hash)", () => {
            const bViaCounts: Record<string, unknown> = {reelStripGeneration: [{type: "generated", length: 1, seed: 1, symbolCounts: {A: 3}}]};
            const draftsA: ReelStripGenerationDrafts = new Map();
            setReelStripGenerationSourceMode(bViaCounts, draftsA, 0, "symbolWeights");
            setReelStripGenerationSymbolWeight(bViaCounts, 0, "A", 9);
            setReelStripGenerationSourceMode(bViaCounts, draftsA, 0, "symbolCounts");
            setReelStripGenerationSymbolCount(bViaCounts, 0, "A", 7);

            const bDirect: Record<string, unknown> = {reelStripGeneration: [{type: "generated", length: 1, seed: 1, symbolCounts: {A: 7}}]};

            expect(JSON.stringify(bViaCounts)).toBe(JSON.stringify(bDirect));
        });

        it("sets and removes symbol counts and weights", () => {
            const b: Record<string, unknown> = {reelStripGeneration: [{type: "generated", length: 1, seed: 1, symbolCounts: {A: 1}}]};
            const drafts: ReelStripGenerationDrafts = new Map();

            setReelStripGenerationSymbolCount(b, 0, "B", 2);
            expect((b.reelStripGeneration as Array<{symbolCounts: unknown}>)[0].symbolCounts).toEqual({A: 1, B: 2});

            removeReelStripGenerationSymbolCount(b, 0, "A");
            expect((b.reelStripGeneration as Array<{symbolCounts: unknown}>)[0].symbolCounts).toEqual({B: 2});

            setReelStripGenerationSourceMode(b, drafts, 0, "symbolWeights");
            setReelStripGenerationSymbolWeight(b, 0, "C", 4);
            expect((b.reelStripGeneration as Array<{symbolWeights: unknown}>)[0].symbolWeights).toEqual({C: 4});

            removeReelStripGenerationSymbolWeight(b, 0, "C");
            expect((b.reelStripGeneration as Array<{symbolWeights: unknown}>)[0].symbolWeights).toEqual({});
        });

        it("sets and removes locked positions", () => {
            const b: Record<string, unknown> = {reelStripGeneration: [{type: "generated", length: 4, seed: 1, symbolCounts: {}}]};

            setReelStripGenerationLockedPosition(b, 0, 0, "W");
            expect((b.reelStripGeneration as Array<{lockedPositions: unknown}>)[0].lockedPositions).toEqual({"0": "W"});

            removeReelStripGenerationLockedPosition(b, 0, 0);
            expect((b.reelStripGeneration as Array<{lockedPositions: unknown}>)[0].lockedPositions).toEqual({});
        });

        it("sets constraints from a parsed JSON array, and clears them for an empty array", () => {
            const b: Record<string, unknown> = {reelStripGeneration: [{type: "generated", length: 1, seed: 1, symbolCounts: {}}]};

            setReelStripGenerationConstraints(b, 0, [{type: "minimumCircularDistance", minimumDistance: 2}]);
            expect((b.reelStripGeneration as Array<{constraints: unknown}>)[0].constraints).toEqual([
                {type: "minimumCircularDistance", minimumDistance: 2},
            ]);

            setReelStripGenerationConstraints(b, 0, []);
            expect((b.reelStripGeneration as Array<{constraints?: unknown}>)[0].constraints).toBeUndefined();
        });

        it("parses a valid constraints JSON array", () => {
            expect(parseReelStripGenerationConstraintsJson('[{"type": "minimumCircularDistance", "minimumDistance": 2}]')).toEqual({
                ok: true,
                constraints: [{type: "minimumCircularDistance", minimumDistance: 2}],
            });
            expect(parseReelStripGenerationConstraintsJson("")).toEqual({ok: true, constraints: []});
            expect(parseReelStripGenerationConstraintsJson("   ")).toEqual({ok: true, constraints: []});
        });

        it("reports a parse error for malformed JSON, without throwing", () => {
            const result = parseReelStripGenerationConstraintsJson("{not valid json");
            expect(result.ok).toBe(false);
        });

        it("reports an error when the parsed JSON isn't an array", () => {
            const result = parseReelStripGenerationConstraintsJson('{"type": "minimumCircularDistance"}');
            expect(result).toEqual({ok: false, error: "Constraints must be a JSON array."});
        });

        it("applies a fully-formed replacement entry wholesale (the Reel Strip Modeler's own Apply action)", () => {
            const b: Record<string, unknown> = {reelStripGeneration: [{type: "literal", strip: ["A"]}, {type: "literal", strip: ["B"]}]};

            applyReelStripGenerationEntry(b, 0, {type: "generated", length: 5, seed: 7, symbolCounts: {A: 5}});

            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 5, seed: 7, symbolCounts: {A: 5}}, {type: "literal", strip: ["B"]}]);
        });

        it("does nothing when the target reel index doesn't exist", () => {
            const b: Record<string, unknown> = {reelStripGeneration: [{type: "literal", strip: ["A"]}]};

            applyReelStripGenerationEntry(b, 5, {type: "literal", strip: ["Z"]});

            expect(b.reelStripGeneration).toEqual([{type: "literal", strip: ["A"]}]);
        });

        it("keeps the outer array length in sync with reels", () => {
            const b: Record<string, unknown> = {reels: 3, reelStripGeneration: [{type: "literal", strip: ["A"]}]};

            resizeReelStripGenerationToReelCount(b);

            expect(b.reelStripGeneration).toEqual([{type: "literal", strip: ["A"]}, {type: "literal", strip: []}, {type: "literal", strip: []}]);
        });

        it("does nothing when reelStripGeneration isn't present", () => {
            const b: Record<string, unknown> = {reels: 3};

            resizeReelStripGenerationToReelCount(b);

            expect(b.reelStripGeneration).toBeUndefined();
        });
    });

    describe("reel generation mode", () => {
        it("reports default when no field is set", () => {
            expect(getReelGenerationMode({})).toBe("default");
        });

        it("reports reelStrips/reelStripGeneration/symbolWeights when set", () => {
            expect(getReelGenerationMode({reelStrips: []})).toBe("reelStrips");
            expect(getReelGenerationMode({reelStripGeneration: []})).toBe("reelStripGeneration");
            expect(getReelGenerationMode({symbolWeights: {}})).toBe("symbolWeights");
        });

        it("switching to reelStrips clears reelStripGeneration/symbolWeights and seeds one empty strip per reel", () => {
            const b: Record<string, unknown> = {reels: 2, symbolWeights: {A: 1}};

            setReelGenerationMode(b, "reelStrips");

            expect(b.symbolWeights).toBeUndefined();
            expect(b.reelStripGeneration).toBeUndefined();
            expect(b.reelStrips).toEqual([[], []]);
        });

        it("switching to reelStripGeneration clears symbolWeights and seeds one literal entry per reel", () => {
            const b: Record<string, unknown> = {reels: 2, symbolWeights: {A: 1}};

            setReelGenerationMode(b, "reelStripGeneration");

            expect(b.symbolWeights).toBeUndefined();
            expect(b.reelStrips).toBeUndefined();
            expect(b.reelStripGeneration).toEqual([{type: "literal", strip: []}, {type: "literal", strip: []}]);
        });

        it("preserves every literal reel strip when converting to the per-reel modeler", () => {
            const b: Record<string, unknown> = {
                reels: 5,
                reelStrips: [
                    ["A", "K", "Q", "J"],
                    ["A", "K", "Q", "J"],
                    ["K", "Q", "J", "J"],
                    ["K", "Q", "J", "J"],
                    ["Q", "Q", "J", "J"],
                ],
            };

            setReelGenerationMode(b, "reelStripGeneration");

            expect(b.reelStrips).toBeUndefined();
            expect(b.reelStripGeneration).toEqual([
                {type: "literal", strip: ["A", "K", "Q", "J"]},
                {type: "literal", strip: ["A", "K", "Q", "J"]},
                {type: "literal", strip: ["K", "Q", "J", "J"]},
                {type: "literal", strip: ["K", "Q", "J", "J"]},
                {type: "literal", strip: ["Q", "Q", "J", "J"]},
            ]);
        });

        it("recovers every missing per-reel entry from complete literal strips instead of clearing them", () => {
            const b: Record<string, unknown> = {
                reels: 3,
                reelStrips: [["A", "K"], ["Q", "J"], ["A", "Q"]],
                // A stale partial per-reel draft must not win over the actual literal model when the
                // user opens the rendered Reel Strip Modeler again.
                reelStripGeneration: [{type: "literal", strip: ["A", "K"]}],
            };

            setReelGenerationMode(b, "reelStripGeneration");

            expect(b.reelStrips).toBeUndefined();
            expect(b.reelStripGeneration).toEqual([
                {type: "literal", strip: ["A", "K"]},
                {type: "literal", strip: ["Q", "J"]},
                {type: "literal", strip: ["A", "Q"]},
            ]);
        });

        it("switching to symbolWeights clears reelStrips/reelStripGeneration", () => {
            const b: Record<string, unknown> = {reelStrips: [["A"]]};

            setReelGenerationMode(b, "symbolWeights");

            expect(b.reelStrips).toBeUndefined();
            expect(b.reelStripGeneration).toBeUndefined();
            expect(b.symbolWeights).toEqual({});
        });

        it("restores literal reel strips after a rendered weights-mode round trip without putting both representations in the Blueprint", () => {
            const b: Record<string, unknown> = {
                reels: 5,
                reelStrips: [["A", "K"], ["A", "Q"], ["K", "J"], ["Q", "J"], ["A", "J"]],
            };
            const drafts = {};

            setReelGenerationMode(b, "symbolWeights", drafts);
            b.symbolWeights = {A: 5, K: 3, Q: 2, J: 1};
            setReelGenerationMode(b, "reelStrips", drafts);

            expect(b.reelStrips).toEqual([["A", "K"], ["A", "Q"], ["K", "J"], ["Q", "J"], ["A", "J"]]);
            expect(b.reelStripGeneration).toBeUndefined();
            expect(b.symbolWeights).toBeUndefined();

            setReelGenerationMode(b, "symbolWeights", drafts);

            expect(b.symbolWeights).toEqual({A: 5, K: 3, Q: 2, J: 1});
            expect(b.reelStrips).toBeUndefined();
        });

        it("switching to default clears all three", () => {
            const b: Record<string, unknown> = {reelStrips: [["A"]], reelStripGeneration: [], symbolWeights: {A: 1}};

            setReelGenerationMode(b, "default");

            expect(b.reelStrips).toBeUndefined();
            expect(b.reelStripGeneration).toBeUndefined();
            expect(b.symbolWeights).toBeUndefined();
        });
    });
});
