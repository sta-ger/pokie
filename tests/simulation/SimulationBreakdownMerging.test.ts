import {mergeSimulationBreakdowns, SimulationBreakdownComponent, summarizeSimulationBreakdown} from "pokie";

const component = (rounds: number, totalBet: number, totalWin: number, maxWin: number): SimulationBreakdownComponent => ({
    rounds,
    totalBet,
    totalWin,
    rtp: totalBet > 0 ? totalWin / totalBet : 0,
    hitFrequency: rounds > 0 ? (totalWin > 0 ? 1 : 0) / rounds : 0,
    maxWin,
});

describe("summarizeSimulationBreakdown", () => {
    it("returns undefined for an empty breakdown", () => {
        expect(summarizeSimulationBreakdown({})).toBeUndefined();
    });

    it("returns the single component unchanged for a one-category breakdown", () => {
        const base = component(100, 100, 95, 10);

        expect(summarizeSimulationBreakdown({base})).toEqual(base);
    });

    it("folds base + freeGames into one overall component -- totalBet excludes the zero-stake freeGames rounds", () => {
        const base = component(80, 400, 300, 20); // 5 rounds/purchase at stake 5, e.g.
        const freeGames = component(20, 0, 150, 30); // zero-stake bonus rounds, still won 150

        const summary = summarizeSimulationBreakdown({base, freeGames});

        expect(summary).toBeDefined();
        expect(summary!.rounds).toBe(100);
        expect(summary!.totalBet).toBe(400); // freeGames' own 0 contributes nothing to the denominator
        expect(summary!.totalWin).toBe(450);
        expect(summary!.rtp).toBeCloseTo(450 / 400, 10);
        expect(summary!.maxWin).toBe(30);
    });

    it("agrees with mergeSimulationBreakdowns' own pairwise arithmetic (no second implementation)", () => {
        const base = component(80, 400, 300, 20);
        const freeGames = component(20, 0, 150, 30);

        const summary = summarizeSimulationBreakdown({base, freeGames});
        // Forcing both components under the same key is what actually exercises the pairwise merge
        // arithmetic (mergeSimulationBreakdowns keys by category, so {base}/{freeGames} as distinct
        // keys would never combine at all) -- summarizeSimulationBreakdown must land on the exact
        // same figures as that merge, since it reuses the same underlying function.
        const mergedAsOneCategory = mergeSimulationBreakdowns({combined: base}, {combined: freeGames}).combined;
        expect(summary).toEqual(mergedAsOneCategory);
    });
});
