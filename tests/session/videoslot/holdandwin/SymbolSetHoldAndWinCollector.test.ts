import {SymbolSetHoldAndWinCollector} from "pokie";

describe("SymbolSetHoldAndWinCollector", () => {
    it("collects every occurrence of a configured symbol, each with its own configured effect", () => {
        const collector = new SymbolSetHoldAndWinCollector<string>({
            C: {kind: "value", amount: 10},
            M: {kind: "multiplier", factor: 2},
        });

        // Reel-major grid: reel 0 = ["C", "X"], reel 1 = ["M", "C"], reel 2 = ["X", "X"].
        const grid = [
            ["C", "X"],
            ["M", "C"],
            ["X", "X"],
        ];

        const collected = collector.collect(grid, []);

        expect(collected).toHaveLength(3);
        expect(collected).toEqual(
            expect.arrayContaining([
                {position: [0, 0], symbolId: "C", effect: {kind: "value", amount: 10}},
                {position: [1, 0], symbolId: "M", effect: {kind: "multiplier", factor: 2}},
                {position: [1, 1], symbolId: "C", effect: {kind: "value", amount: 10}},
            ]),
        );
    });

    it("never re-collects a position already present in alreadyLocked", () => {
        const collector = new SymbolSetHoldAndWinCollector<string>({C: {kind: "value", amount: 10}});
        const grid = [
            ["C", "C"],
            ["X", "X"],
        ];

        const collected = collector.collect(grid, [{position: [0, 0], symbolId: "C", effect: {kind: "value", amount: 10}}]);

        expect(collected).toEqual([{position: [0, 1], symbolId: "C", effect: {kind: "value", amount: 10}}]);
    });

    it("ignores symbols with no configured effect", () => {
        const collector = new SymbolSetHoldAndWinCollector<string>({C: {kind: "value", amount: 10}});
        const grid = [["X", "Y", "Z"]];

        expect(collector.collect(grid, [])).toEqual([]);
    });
});
