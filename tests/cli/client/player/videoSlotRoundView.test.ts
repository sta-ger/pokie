import {
    deriveAvailableBets,
    deriveFeatureCounters,
    deriveLineDefinitions,
    derivePaytableView,
    deriveTotalWin,
    deriveWinHighlights,
    isVideoSlotRoundResponse,
} from "../../../../cli/client/player/videoSlotRoundView.js";

describe("isVideoSlotRoundResponse", () => {
    it("recognizes a response carrying a reelsSymbols grid", () => {
        expect(isVideoSlotRoundResponse({reelsSymbols: [["A", "K"], ["Q"]]})).toBe(true);
    });

    it("rejects a response with no reelsSymbols field", () => {
        expect(isVideoSlotRoundResponse({bet: 5, win: 10})).toBe(false);
    });

    it("rejects a response whose reelsSymbols isn't an array of arrays", () => {
        expect(isVideoSlotRoundResponse({reelsSymbols: "not-an-array"})).toBe(false);
        expect(isVideoSlotRoundResponse({reelsSymbols: ["A", "K"]})).toBe(false);
    });
});

describe("deriveWinHighlights", () => {
    it("returns an empty list when the response has no win fields at all", () => {
        expect(deriveWinHighlights({reelsSymbols: [["A"]]})).toEqual([]);
    });

    it("normalizes a winning line's reel-index-only symbolsPositions into [reelIndex, rowIndex] pairs via its own definition", () => {
        const highlights = deriveWinHighlights({
            reelsSymbols: [["A"]],
            winningLines: {
                "1": {
                    definition: [0, 1, 2],
                    pattern: [1, 1, 0],
                    symbolsPositions: [0, 1],
                    winAmount: 15,
                },
            },
        });

        expect(highlights).toEqual([
            {
                id: "line:1",
                kind: "line",
                label: "Line: 1, win: 15",
                winAmount: 15,
                positions: [
                    [0, 0],
                    [1, 1],
                ],
                line: {
                    lineId: "1",
                    definition: [0, 1, 2],
                    pattern: [1, 1, 0],
                    symbolsPositions: [0, 1],
                    winAmount: 15,
                },
            },
        ]);
    });

    it("carries a winning line's own definition when it has no winning positions this round", () => {
        const highlights = deriveWinHighlights({
            reelsSymbols: [["A"]],
            winningLines: {"2": {definition: [0, 1], pattern: [0, 0], symbolsPositions: [], winAmount: 0}},
        });

        expect(highlights[0].positions).toEqual([]);
    });

    it("carries scatter/cluster/value/way positions through unchanged, never recomputing them", () => {
        const response = {
            reelsSymbols: [["A"]],
            winningScatters: {S: {symbolsPositions: [[0, 0], [1, 1]], winAmount: 5}},
            winningClusters: {C: {symbolsPositions: [[2, 2]], winAmount: 7}},
            winningValues: {V: {symbolsPositions: [[3, 0]], winAmount: 9}},
            winningWays: {W: {symbolsPositions: [[0, 1], [0, 2]], waysCount: 4, winAmount: 11}},
        };

        const highlights = deriveWinHighlights(response);

        expect(highlights).toEqual([
            {id: "scatter:S", kind: "scatter", label: "Scatter: S, win: 5", winAmount: 5, positions: [[0, 0], [1, 1]]},
            {id: "cluster:C", kind: "cluster", label: "Cluster: C x1, win: 7", winAmount: 7, positions: [[2, 2]]},
            {id: "value:V", kind: "value", label: "Value: V, win: 9", winAmount: 9, positions: [[3, 0]]},
            {id: "way:W", kind: "way", label: "Way: W, win: 11", winAmount: 11, positions: [[0, 1], [0, 2]]},
        ]);
    });

    it("orders lines before scatters/clusters/values/ways, matching pokie-examples' own rendering order", () => {
        const highlights = deriveWinHighlights({
            reelsSymbols: [["A"]],
            winningWays: {W: {symbolsPositions: [], waysCount: 1, winAmount: 1}},
            winningLines: {"1": {definition: [0], pattern: [1], symbolsPositions: [0], winAmount: 1}},
            winningScatters: {S: {symbolsPositions: [], winAmount: 1}},
        });

        expect(highlights.map((h) => h.kind)).toEqual(["line", "scatter", "way"]);
    });
});

describe("deriveTotalWin", () => {
    it("returns the numeric totalWin when present", () => {
        expect(deriveTotalWin({totalWin: 42})).toBe(42);
    });

    it("returns undefined when totalWin is absent or not a number", () => {
        expect(deriveTotalWin({})).toBeUndefined();
        expect(deriveTotalWin({totalWin: "42"})).toBeUndefined();
    });
});

describe("deriveFeatureCounters", () => {
    it("returns an empty list when no free-games counters are present", () => {
        expect(deriveFeatureCounters({})).toEqual([]);
    });

    it("reads freeGamesNum/freeGamesSum/freeGamesBank when present, in that order", () => {
        expect(deriveFeatureCounters({freeGamesNum: 3, freeGamesSum: 10, freeGamesBank: 1000})).toEqual([
            {label: "FG num", value: 3},
            {label: "FG sum", value: 10},
            {label: "FG bank", value: 1000},
        ]);
    });

    it("omits a counter whose field isn't a number", () => {
        expect(deriveFeatureCounters({freeGamesNum: 3, freeGamesSum: "not a number"})).toEqual([{label: "FG num", value: 3}]);
    });
});

describe("derivePaytableView", () => {
    it("returns undefined when paytable is missing or not an object", () => {
        expect(derivePaytableView(undefined)).toBeUndefined();
        expect(derivePaytableView("nope")).toBeUndefined();
    });

    it("reads the first bet entry's symbol/multiplier table, sorting multipliers ascending", () => {
        const paytable = {
            "10": {
                A: {"5": 100, "3": 10},
                B: {"5": 50},
            },
        };

        expect(derivePaytableView(paytable)).toEqual({
            multipliers: [3, 5],
            rows: [
                {symbolId: "A", amounts: [10, 100]},
                {symbolId: "B", amounts: [undefined, 50]},
            ],
        });
    });
});

describe("deriveLineDefinitions", () => {
    it("returns an empty list when linesDefinitions is missing", () => {
        expect(deriveLineDefinitions(undefined)).toEqual([]);
    });

    it("maps every entry to a {lineId, definition} view", () => {
        expect(deriveLineDefinitions({"1": [0, 1, 2], "2": [1, 1, 1]})).toEqual([
            {lineId: "1", definition: [0, 1, 2]},
            {lineId: "2", definition: [1, 1, 1]},
        ]);
    });
});

describe("deriveAvailableBets", () => {
    it("returns an empty list when availableBets is missing or not an array", () => {
        expect(deriveAvailableBets(undefined)).toEqual([]);
        expect(deriveAvailableBets("nope")).toEqual([]);
    });

    it("filters out non-numeric entries", () => {
        expect(deriveAvailableBets([1, "2", 3])).toEqual([1, 3]);
    });
});
