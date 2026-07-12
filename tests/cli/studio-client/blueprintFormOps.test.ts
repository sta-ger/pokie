import {
    addBet,
    addPayline,
    addReelStripSymbol,
    addSymbol,
    duplicateBetAt,
    duplicatePaylineAt,
    duplicatePaytablePayout,
    duplicateReelStripSymbolAt,
    duplicateSymbolAt,
    getReelGenerationMode,
    moveBetAt,
    movePaylineAt,
    moveReelStripSymbolAt,
    moveSymbolAt,
    removeBetAt,
    removePaylineAt,
    removePaytablePayout,
    removeReelStripSymbolAt,
    removeSymbolAt,
    removeSymbolWeight,
    resizePaylinesToReelCount,
    resizeReelStripsToReelCount,
    setBetAt,
    setPaylineCell,
    setPaytablePayout,
    setReelGenerationMode,
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

    describe("reel generation mode", () => {
        it("reports default when neither field is set", () => {
            expect(getReelGenerationMode({})).toBe("default");
        });

        it("reports reelStrips/symbolWeights when set", () => {
            expect(getReelGenerationMode({reelStrips: []})).toBe("reelStrips");
            expect(getReelGenerationMode({symbolWeights: {}})).toBe("symbolWeights");
        });

        it("switching to reelStrips clears symbolWeights and seeds one empty strip per reel", () => {
            const b: Record<string, unknown> = {reels: 2, symbolWeights: {A: 1}};

            setReelGenerationMode(b, "reelStrips");

            expect(b.symbolWeights).toBeUndefined();
            expect(b.reelStrips).toEqual([[], []]);
        });

        it("switching to symbolWeights clears reelStrips", () => {
            const b: Record<string, unknown> = {reelStrips: [["A"]]};

            setReelGenerationMode(b, "symbolWeights");

            expect(b.reelStrips).toBeUndefined();
            expect(b.symbolWeights).toEqual({});
        });

        it("switching to default clears both", () => {
            const b: Record<string, unknown> = {reelStrips: [["A"]], symbolWeights: {A: 1}};

            setReelGenerationMode(b, "default");

            expect(b.reelStrips).toBeUndefined();
            expect(b.symbolWeights).toBeUndefined();
        });
    });
});
