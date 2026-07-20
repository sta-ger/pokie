import {
    addBet,
    addPayline,
    asBetModesList,
    duplicateBetModeAt,
    moveBetModeAt,
    setBetModeField,
    addReelStripGenerationLiteralSymbol,
    addReelStripSymbol,
    addSymbol,
    applyReelStripGenerationEntry,
    duplicateBetAt,
    duplicatePaylineAt,
    duplicatePaytablePayout,
    duplicateReelStripGenerationLiteralSymbolAt,
    duplicateReelStripSymbolAt,
    duplicateSymbolAt,
    getReelGenerationMode,
    getReelStripGenerationSourceMode,
    moveBetAt,
    movePaylineAt,
    moveReelStripGenerationLiteralSymbolAt,
    moveReelStripSymbolAt,
    moveSymbolAt,
    parseReelStripGenerationConstraintsJson,
    removeBetAt,
    removePaylineAt,
    removePaytablePayout,
    removeReelStripGenerationLiteralSymbolAt,
    removeReelStripGenerationLockedPosition,
    removeReelStripGenerationSymbolCount,
    removeReelStripGenerationSymbolWeight,
    removeReelStripSymbolAt,
    removeSymbolAt,
    removeSymbolWeight,
    resizePaylinesToReelCount,
    resizeReelStripGenerationToReelCount,
    resizeReelStripsToReelCount,
    setBetAt,
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
        // Regression: runtimeType/isDefault/forcedFreeGames (the explicit, opt-in runtime-semantics
        // contract -- see gamepackage/BetMode.ts's own doc comment) have no dedicated editor UI yet,
        // but must still round-trip losslessly through every existing bet-mode form operation --
        // editing an unrelated field (e.g. Label) on the SAME blueprint must never silently strip them.
        it("preserves runtimeType/isDefault/forcedFreeGames/targetRtp across an unrelated field edit", () => {
            const b: Record<string, unknown> = {
                betModes: [
                    {id: "base", runtimeType: "base", isDefault: true, targetRtp: 0.94},
                    {id: "buy-bonus", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 10, targetRtp: 0.9},
                ],
            };

            setBetModeField(b, 1, "label", "Buy Bonus");

            expect(asBetModesList(b.betModes)).toEqual([
                {id: "base", runtimeType: "base", isDefault: true, targetRtp: 0.94},
                {
                    id: "buy-bonus",
                    label: "Buy Bonus",
                    runtimeType: "buyFeature",
                    costMultiplier: 100,
                    forcedFreeGames: 10,
                    targetRtp: 0.9,
                },
            ]);
        });

        it("drops an unrecognized runtimeType/malformed isDefault/forcedFreeGames/targetRtp rather than passing them through as-is", () => {
            const parsed = asBetModesList([{id: "base", runtimeType: "bogus", isDefault: "yes", forcedFreeGames: "ten", targetRtp: "high"}]);

            expect(parsed).toEqual([{id: "base"}]);
        });

        it("setBetModeField edits targetRtp directly (the dedicated BetModesEditor column)", () => {
            const b: Record<string, unknown> = {betModes: [{id: "base"}]};

            setBetModeField(b, 0, "targetRtp", 0.965);

            expect(asBetModesList(b.betModes)).toEqual([{id: "base", targetRtp: 0.965}]);
        });

        it("preserves targetRtp when reordering bet modes (moveBetModeAt)", () => {
            const b: Record<string, unknown> = {
                betModes: [
                    {id: "base", targetRtp: 0.94},
                    {id: "ante", costMultiplier: 1.25, targetRtp: 0.965},
                ],
            };

            moveBetModeAt(b, 0, 1);

            expect(asBetModesList(b.betModes)).toEqual([
                {id: "ante", costMultiplier: 1.25, targetRtp: 0.965},
                {id: "base", targetRtp: 0.94},
            ]);
        });

        it("preserves targetRtp when duplicating a bet mode (duplicateBetModeAt)", () => {
            const b: Record<string, unknown> = {
                betModes: [{id: "buy-bonus", costMultiplier: 100, forcedFreeGames: 10, targetRtp: 0.9}],
            };

            duplicateBetModeAt(b, 0);

            expect(asBetModesList(b.betModes)).toEqual([
                {id: "buy-bonus", costMultiplier: 100, forcedFreeGames: 10, targetRtp: 0.9},
                {id: "buy-bonus-copy", costMultiplier: 100, forcedFreeGames: 10, targetRtp: 0.9},
            ]);
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

        it("switching to reelStripGeneration clears reelStrips/symbolWeights and seeds one literal entry per reel", () => {
            const b: Record<string, unknown> = {reels: 2, symbolWeights: {A: 1}};

            setReelGenerationMode(b, "reelStripGeneration");

            expect(b.symbolWeights).toBeUndefined();
            expect(b.reelStrips).toBeUndefined();
            expect(b.reelStripGeneration).toEqual([{type: "literal", strip: []}, {type: "literal", strip: []}]);
        });

        it("switching to symbolWeights clears reelStrips/reelStripGeneration", () => {
            const b: Record<string, unknown> = {reelStrips: [["A"]]};

            setReelGenerationMode(b, "symbolWeights");

            expect(b.reelStrips).toBeUndefined();
            expect(b.reelStripGeneration).toBeUndefined();
            expect(b.symbolWeights).toEqual({});
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
