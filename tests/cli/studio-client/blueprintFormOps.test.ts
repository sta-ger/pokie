import {
    addBet,
    addPayline,
    addReelStripGenerationLiteralSymbol,
    addReelStripSymbol,
    addSymbol,
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
} from "../../../cli/studio-client/blueprintFormOps.js";

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
        it("switches a reel's own entry between literal and generated", () => {
            const b: Record<string, unknown> = {reelStripGeneration: [{type: "literal", strip: ["A"]}]};

            setReelStripGenerationEntryType(b, 0, "generated");
            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 1, seed: 1, symbolCounts: {}}]);

            setReelStripGenerationEntryType(b, 0, "literal");
            expect(b.reelStripGeneration).toEqual([{type: "literal", strip: []}]);
        });

        it("does nothing for an out-of-range reel index", () => {
            const b: Record<string, unknown> = {reelStripGeneration: [{type: "literal", strip: ["A"]}]};

            setReelStripGenerationEntryType(b, 5, "generated");

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

        it("reports and switches between symbolCounts and symbolWeights, preserving each side's own data", () => {
            const entry = {type: "generated", length: 1, seed: 1, symbolCounts: {A: 3}};
            expect(getReelStripGenerationSourceMode(entry)).toBe("symbolCounts");

            const b: Record<string, unknown> = {reelStripGeneration: [entry]};
            setReelStripGenerationSourceMode(b, 0, "symbolWeights");
            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 1, seed: 1, symbolWeights: {}}]);

            setReelStripGenerationSymbolWeight(b, 0, "A", 5);
            setReelStripGenerationSourceMode(b, 0, "symbolCounts");
            expect(b.reelStripGeneration).toEqual([{type: "generated", length: 1, seed: 1, symbolCounts: {}}]);
        });

        it("sets and removes symbol counts and weights", () => {
            const b: Record<string, unknown> = {reelStripGeneration: [{type: "generated", length: 1, seed: 1, symbolCounts: {A: 1}}]};

            setReelStripGenerationSymbolCount(b, 0, "B", 2);
            expect((b.reelStripGeneration as Array<{symbolCounts: unknown}>)[0].symbolCounts).toEqual({A: 1, B: 2});

            removeReelStripGenerationSymbolCount(b, 0, "A");
            expect((b.reelStripGeneration as Array<{symbolCounts: unknown}>)[0].symbolCounts).toEqual({B: 2});

            setReelStripGenerationSourceMode(b, 0, "symbolWeights");
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
