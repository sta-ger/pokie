import {
    deriveAvailableBetModeIds,
    deriveAvailableBets,
    deriveBetModeId,
    deriveFeatureCounters,
    deriveLineDefinitions,
    derivePaytableView,
    deriveTotalWin,
    deriveWinHighlights,
    deriveWinHighlightsFromRoundArtifactWins,
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
                paylinePositions: [
                    [0, 0],
                    [1, 1],
                    [2, 2],
                ],
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

// deriveWinHighlightsFromRoundArtifactWins is the RoundArtifact-shaped counterpart to deriveWinHighlights
// above -- both produce the exact same WinHighlight contract, so Studio's own
// cli/studio-client/src/components/common/WinOverlay.tsx (an arbitrary game's own RoundArtifact wins) and
// this repo's/pokie-examples' own VideoSlotRoundResponse-derived rendering share one presentation instead
// of each deriving "what's highlighted" independently.
describe("deriveWinHighlightsFromRoundArtifactWins", () => {
    it("carries a line win's own winningPositions through unchanged, and traces its full payline from metadata.definition", () => {
        const highlights = deriveWinHighlightsFromRoundArtifactWins(
            [
                {
                    type: "line",
                    id: "w1",
                    symbolId: "cherry",
                    winAmount: 12.5,
                    winningPositions: [[0, 0], [1, 0]],
                    metadata: {definition: [0, 0, 0]},
                },
            ],
            3,
        );

        expect(highlights).toEqual([
            {
                id: "line:w1",
                kind: "line",
                label: "Line: w1, win: 12.5",
                winAmount: 12.5,
                positions: [[0, 0], [1, 0]],
                paylinePositions: [[0, 0], [1, 0], [2, 0]],
            },
        ]);
    });

    it("traces no payline path for a win whose metadata carries no usable definition -- ways/cluster/scatter/value, or a malformed/mis-sized one", () => {
        const [highlight] = deriveWinHighlightsFromRoundArtifactWins(
            [{type: "ways", id: "w1", symbolId: "cherry", winAmount: 3, winningPositions: [[0, 0]], metadata: {}}],
            3,
        );

        expect(highlight.paylinePositions).toBeUndefined();
        expect(highlight.positions).toEqual([[0, 0]]);
    });

    it("never recomputes a win: positions are the win's own winningPositions, deep-copied, not re-derived", () => {
        const winningPositions = [[0, 0]];
        const [highlight] = deriveWinHighlightsFromRoundArtifactWins(
            [{type: "scatter", id: "w1", symbolId: "S", winAmount: 5, winningPositions, metadata: {}}],
            3,
        );

        expect(highlight.positions).toEqual(winningPositions);
        expect(highlight.positions).not.toBe(winningPositions);
    });

    it("uses the same standard labels, kind spelling, identity and positions as an equivalent VideoSlot wire round", () => {
        const fromWire = deriveWinHighlights({
            reelsSymbols: [["A"], ["S"], ["C"]],
            winningLines: {"4": {lineId: "4", symbolId: "A", definition: [0, 1, 0], symbolsPositions: [0, 1], winAmount: 12}},
            winningScatters: {S: {symbolId: "S", symbolsPositions: [[1, 0]], winAmount: 5}},
            winningClusters: {clusterA: {symbolId: "C", symbolsPositions: [[2, 0], [2, 1]], winAmount: 7}},
            winningValues: {V: {symbolId: "V", symbolsPositions: [[0, 0]], winAmount: 9}},
            winningWays: {W: {symbolId: "W", symbolsPositions: [[1, 1]], winAmount: 11}},
        });
        const fromArtifact = deriveWinHighlightsFromRoundArtifactWins(
            [
                {type: "line", id: "4", symbolId: "A", winAmount: 12, winningPositions: [[0, 0], [1, 1]], metadata: {definition: [0, 1, 0]}},
                {type: "scatter", id: "S", symbolId: "S", winAmount: 5, winningPositions: [[1, 0]], metadata: {}},
                {type: "cluster", id: "clusterA", symbolId: "C", winAmount: 7, winningPositions: [[2, 0], [2, 1]], metadata: {}},
                {type: "value", id: "V", symbolId: "V", winAmount: 9, winningPositions: [[0, 0]], metadata: {}},
                {type: "ways", id: "W", symbolId: "W", winAmount: 11, winningPositions: [[1, 1]], metadata: {}},
            ],
            3,
        );

        expect(fromArtifact).toEqual(fromWire);
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

    it("preserves the first occurrence of each numeric bet", () => {
        expect(deriveAvailableBets([1, 2, 1, 5, 2])).toEqual([1, 2, 5]);
    });
});

describe("deriveAvailableBetModeIds", () => {
    it("returns an empty list when availableBetModeIds is missing or not an array -- e.g. a session that never opted into bet-mode selection", () => {
        expect(deriveAvailableBetModeIds(undefined)).toEqual([]);
        expect(deriveAvailableBetModeIds("nope")).toEqual([]);
    });

    it("filters out non-string entries", () => {
        expect(deriveAvailableBetModeIds(["base", 2, "ante"])).toEqual(["base", "ante"]);
    });
});

describe("deriveBetModeId", () => {
    it("returns the string betModeId when present", () => {
        expect(deriveBetModeId("ante")).toBe("ante");
    });

    it("returns undefined when betModeId is missing or not a string", () => {
        expect(deriveBetModeId(undefined)).toBeUndefined();
        expect(deriveBetModeId(42)).toBeUndefined();
    });
});

// A realistic fixture matching pokie-examples' own simple-slot game (5 reels x 4 rows, lines
// counted right-to-left, a Scatter1/Scatter2 pair) -- field names/shapes verified against a real
// `git clone --branch develop https://github.com/sta-ger/pokie-examples.git` checkout's
// src/ui/utils.ts (drawWinningLinesList/drawOutcome, which destructure WinningLineNetworkData /
// WinningScatterNetworkData imported directly from "pokie") and src/games/simple-slot/index.ts
// (which builds its session via pokie's own VideoSlotSession + VideoSlotSessionSerializer, not a
// hand-rolled equivalent). This is the strongest proof this worktree can produce that the shared
// player's derive functions render exactly what a real pokie-examples game already emits, without
// requiring push/write access to that separate repository (see this step's own commit message for
// why an actual pokie-examples commit is out of scope here).
describe("pokie-examples compatibility (simple-slot-shaped round response)", () => {
    const simpleSlotRound = {
        reelsSymbols: [
            ["Ace", "King", "Queen", "Jack"],
            ["Ace", "Ace", "Ace", "Ten"],
            ["Ace", "King", "Queen", "Jack"],
            ["King", "Queen", "Jack", "Nine"],
            ["Queen", "Jack", "Ten", "Nine"],
        ],
        bet: 20,
        credits: 980,
        totalWin: 100,
        availableBets: [10, 20, 30, 40, 50, 100, 200, 250, 500],
        winningLines: {
            "0": {
                definition: [0, 1, 0, 0, 0],
                pattern: [1, 1, 1, 0, 0],
                symbolId: "Ace",
                lineId: "0",
                symbolsPositions: [0, 1],
                wildSymbolsPositions: [],
                winAmount: 40,
            },
        },
        winningScatters: {
            Scatter1: {symbolId: "Scatter1", symbolsPositions: [[0, 0], [2, 1], [4, 2]], winAmount: 60},
        },
    };

    it("recognizes the round as a video-slot response", () => {
        expect(isVideoSlotRoundResponse(simpleSlotRound)).toBe(true);
    });

    it("derives both the winning line and the scatter as highlights, lines first", () => {
        const highlights = deriveWinHighlights(simpleSlotRound);
        expect(highlights.map((h) => h.kind)).toEqual(["line", "scatter"]);
        expect(highlights[0]).toMatchObject({label: "Line: 0, win: 40"});
        expect(highlights[1]).toMatchObject({label: "Scatter: Scatter1, win: 60"});
    });

    it("derives the same availableBets simple-slot's own config declares", () => {
        expect(deriveAvailableBets(simpleSlotRound.availableBets)).toEqual([10, 20, 30, 40, 50, 100, 200, 250, 500]);
    });

    it("derives the round's own totalWin unchanged", () => {
        expect(deriveTotalWin(simpleSlotRound)).toBe(100);
    });
});
