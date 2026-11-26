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

function freeGamesBlueprint(): GameBlueprint {
    return {
        info: {id: "free-games-tiny", name: "Free Games Tiny", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "K", "S"],
        scatters: ["S"],
        paytable: {
            A: {3: 10},
            K: {3: 2},
        },
        reelStrips: [
            ["A", "K", "S"],
            ["A", "A", "S"],
            ["A", "K", "S"],
        ],
        paylines: [[0, 0, 0]],
        availableBets: [1],
        mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 2}}},
    };
}

function freeGamesFiniteBlueprint(): GameBlueprint {
    return {
        info: {id: "free-games-finite", name: "Free Games Finite", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "K", "Q", "J", "S"],
        scatters: ["S"],
        paytable: {
            A: {3: 8},
            K: {3: 6},
            Q: {3: 4},
            J: {3: 1},
        },
        reelStrips: [
            ["A", "K", "Q", "J", "J", "S", "A"],
            ["K", "Q", "A", "J", "J", "S", "K"],
            ["Q", "K", "J", "A", "J", "S", "Q"],
        ],
        paylines: [[0, 0, 0], [1, 1, 1], [2, 2, 2]],
        availableBets: [1, 2, 5],
        mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10}}},
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

    it("reports feature triggers separately from the paid-spin RTP", async () => {
        const result = await analyzeBlueprintMath(freeGamesBlueprint(), {pokieVersion: "2.0.0", maxOutcomes: 100});

        expect(result.status).toBe("ok");
        if (result.status !== "ok") throw new Error(result.reason);
        expect(result.featureBreakdown.featureEvents.map((event) => event.key)).toEqual(["freeGamesTriggered"]);
        expect(result.featureBreakdown.featureEvents[0]?.weightedFrequency).toBe(1);
        expect(result.freeGamesRtp.status).toBe("infinite");
        // The exact RTP is the paid-spin figure; the free-games award is recorded as a trigger, not
        // silently added to this library's total. The same blueprint without the mechanic must produce
        // the same paid-spin RTP.
        const {mechanics: _mechanics, ...withoutMechanics} = freeGamesBlueprint();
        const baseOnly = await analyzeBlueprintMath(withoutMechanics, {pokieVersion: "2.0.0", maxOutcomes: 100});
        expect(baseOnly.status).toBe("ok");
        if (baseOnly.status !== "ok") throw new Error(baseOnly.reason);
        expect(result.analysis.rtp).toBeCloseTo(baseOnly.analysis.rtp, 12);
    });

    it("caps a supercritical free-games feature and keeps its expected RTP finite", async () => {
        const blueprint = freeGamesBlueprint();
        blueprint.mechanics!.freeGames!.maxFreeGames = 5;
        const result = await analyzeBlueprintMath(blueprint, {pokieVersion: "2.0.0", maxOutcomes: 100});

        expect(result.status).toBe("ok");
        if (result.status !== "ok") throw new Error(result.reason);
        expect(result.freeGamesRtp.status).toBe("available");
        if (result.freeGamesRtp.status !== "available") throw new Error(result.freeGamesRtp.reason);
        expect(result.freeGamesRtp.method).toBe("additive-retrigger-capped");
        expect(result.freeGamesRtp.maxFreeGames).toBe(5);
        // Every paid spin always shows three scatters and awards two free games. The cap makes the
        // feature exactly five spins long instead of an unbounded retrigger series.
        expect(result.freeGamesRtp.expectedFreeSpins).toBe(5);
        expect(result.freeGamesRtp.featureRtp).toBeCloseTo(5 * result.analysis.rtp, 12);
        expect(result.freeGamesRtp.totalRtp).toBeCloseTo(6 * result.analysis.rtp, 12);
    });

    it("derives exact total RTP for additive free games", async () => {
        const result = await analyzeBlueprintMath(freeGamesFiniteBlueprint(), {pokieVersion: "2.0.0", maxOutcomes: 1_000});

        expect(result.status).toBe("ok");
        if (result.status !== "ok") throw new Error(result.reason);
        expect(result.freeGamesRtp.status).toBe("available");
        if (result.freeGamesRtp.status !== "available") throw new Error(result.freeGamesRtp.reason);
        const triggerProbability = (3 / 7) ** 3;
        const expectedFreeSpins = 10 / (1 - triggerProbability * 10);
        expect(result.freeGamesRtp.triggerProbability).toBeCloseTo(triggerProbability, 12);
        expect(result.freeGamesRtp.expectedAward).toBe(10);
        expect(result.freeGamesRtp.expectedFreeSpins).toBeCloseTo(expectedFreeSpins, 12);
        expect(result.freeGamesRtp.featureRtp).toBeCloseTo(triggerProbability * expectedFreeSpins * result.analysis.rtp, 12);
        expect(result.freeGamesRtp.totalRtp).toBeCloseTo(result.analysis.rtp + result.freeGamesRtp.featureRtp, 12);
        expect(result.freeGamesRtp.totalRtp).toBeGreaterThan(result.analysis.rtp);
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
