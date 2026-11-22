import {describeGeneratedBlueprint} from "../../../cli/studio-client/src/domain/generatedBlueprintSummary.js";

describe("generated blueprint summary", () => {
    it("describes a generated line-pay draft without pretending it is tuned", () => {
        const summary = describeGeneratedBlueprint({
            info: {name: "Royal Grand Stampede", id: "royal-grand-stampede", version: "0.1.0"},
            reels: 6,
            rows: 3,
            symbols: ["A", "K", "Q", "J", "10"],
            paytable: {},
            availableBets: [1, 2, 5, 10],
        });
        expect(summary.name).toBe("Royal Grand Stampede");
        expect(summary.board).toBe("6 × 3");
        expect(summary.symbols).toBe("5 (A, K, Q, J, 10)");
        expect(summary.paylines).toBe("engine default (3 horizontal lines)");
        expect(summary.winModel).toBe("lines (default)");
        expect(summary.features).toEqual(["base line game only — no wilds, scatters, free games or bet modes yet"]);
    });

    it("names authored paylines, wilds, scatters and mechanics", () => {
        const summary = describeGeneratedBlueprint({
            info: {name: "Feature Draft"},
            reels: 5,
            rows: 3,
            symbols: ["A", "W", "S"],
            wilds: ["W"],
            scatters: ["S"],
            paylines: [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1]],
            availableBets: [1, 5],
            winModel: {type: "ways"},
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {"3": 10}}},
            betModes: [{id: "base"}, {id: "ante"}],
        });
        expect(summary.paylines).toBe("2 authored");
        expect(summary.wilds).toBe("W");
        expect(summary.scatters).toBe("S");
        expect(summary.features).toEqual(["wilds", "scatters", "ways wins", "free games", "2 bet modes"]);
    });

    it("stays safe with malformed input", () => {
        const summary = describeGeneratedBlueprint(null);
        expect(summary.name).toBe("(unnamed)");
        expect(summary.board).toBe("not specified");
        expect(summary.paylines).toBe("engine default (one horizontal line per row)");
        expect(summary.features[0]).toContain("base line game only");
    });
});
