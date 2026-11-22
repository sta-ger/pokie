import {analyzeBlueprintMath} from "../../src/weightedoutcome/BlueprintMathAnalysis.js";
import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";

function tinyBlueprint(): GameBlueprint {
    return {
        info: {id: "tiny", name: "Tiny", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "K"],
        paytable: {
            A: {3: 10},
            K: {3: 2},
        },
        reelStrips: [
            ["A", "K", "K"],
            ["A", "A", "K"],
            ["A", "K", "K"],
        ],
        paylines: [[0, 0, 0]],
        availableBets: [1],
    };
}

describe("analyzeBlueprintMath", () => {
    it("enumerates a draft exactly and exposes event-level probabilities", async () => {
        const result = await analyzeBlueprintMath(tinyBlueprint(), {pokieVersion: "2.0.0", maxOutcomes: 100});

        expect(result.status).toBe("ok");
        if (result.status !== "ok") throw new Error(result.reason);
        expect(result.outcomeCount).toBe(27);
        expect(result.stake).toBe(1);
        expect(result.analysis.rtp).toBeCloseTo(28 / 27, 12);
        expect(result.analysis.hitFrequency).toBeCloseTo(6 / 27, 12);
        expect(result.analysis.maxWin).toBe(10);
        const events = result.wins.events.entries;
        expect(events).toHaveLength(2);
        expect(events.find((event) => event.label === "A × 3")).toMatchObject({
            kind: "line",
            winType: "line",
            symbolId: "A",
            matchCount: 3,
            probability: 2 / 27,
            outcomeCount: 2,
        });
        expect(events.find((event) => event.label === "K × 3")).toMatchObject({
            kind: "line",
            symbolId: "K",
            matchCount: 3,
            probability: 4 / 27,
            outcomeCount: 4,
        });
    });

    it("refuses a draft above the exact cap instead of sampling it", async () => {
        const result = await analyzeBlueprintMath(tinyBlueprint(), {pokieVersion: "2.0.0", maxOutcomes: 10});

        expect(result.status).toBe("unavailable");
        if (result.status !== "unavailable") throw new Error("expected unavailable");
        expect(result.outcomeSpaceSize).toBe(BigInt(27));
        expect(result.reason).toMatch(/exact preview cap is 10/i);
    });

    it("reports an invalid draft as unavailable", async () => {
        const result = await analyzeBlueprintMath({info: {id: "bad"}}, {pokieVersion: "2.0.0"});

        expect(result.status).toBe("unavailable");
    });
});
