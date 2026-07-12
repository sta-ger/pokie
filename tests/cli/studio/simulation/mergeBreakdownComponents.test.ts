import type {SimulationBreakdownComponent} from "pokie";
import {mergeBreakdownComponents} from "../../../../cli/studio/simulation/mergeBreakdownComponents.js";

describe("mergeBreakdownComponents", () => {
    it("returns the addition unchanged when there is no base yet", () => {
        const addition: Record<string, SimulationBreakdownComponent> = {
            base: {rounds: 100, totalBet: 100, totalWin: 95, rtp: 0.95, hitFrequency: 0.3, maxWin: 20},
        };

        expect(mergeBreakdownComponents(undefined, addition)).toEqual(addition);
    });

    it("adds a brand-new category untouched", () => {
        const base: Record<string, SimulationBreakdownComponent> = {
            base: {rounds: 100, totalBet: 100, totalWin: 95, rtp: 0.95, hitFrequency: 0.3, maxWin: 20},
        };
        const addition: Record<string, SimulationBreakdownComponent> = {
            freeGames: {rounds: 10, totalBet: 0, totalWin: 50, rtp: 0, hitFrequency: 0.5, maxWin: 30},
        };

        const merged = mergeBreakdownComponents(base, addition);

        expect(merged.base).toEqual(base.base);
        expect(merged.freeGames).toEqual(addition.freeGames);
    });

    it("sums rounds/totalBet/totalWin and recomputes rtp/hitFrequency for an existing category", () => {
        const base: Record<string, SimulationBreakdownComponent> = {
            base: {rounds: 100, totalBet: 100, totalWin: 90, rtp: 0.9, hitFrequency: 0.2, maxWin: 15},
        };
        const addition: Record<string, SimulationBreakdownComponent> = {
            base: {rounds: 100, totalBet: 100, totalWin: 110, rtp: 1.1, hitFrequency: 0.3, maxWin: 25},
        };

        const merged = mergeBreakdownComponents(base, addition);

        expect(merged.base).toEqual({
            rounds: 200,
            totalBet: 200,
            totalWin: 200,
            rtp: 1,
            hitFrequency: 0.25,
            maxWin: 25,
        });
    });

    it("takes the max of maxWin across chunks", () => {
        const base: Record<string, SimulationBreakdownComponent> = {
            base: {rounds: 10, totalBet: 10, totalWin: 5, rtp: 0.5, hitFrequency: 0.1, maxWin: 100},
        };
        const addition: Record<string, SimulationBreakdownComponent> = {
            base: {rounds: 10, totalBet: 10, totalWin: 5, rtp: 0.5, hitFrequency: 0.1, maxWin: 40},
        };

        expect(mergeBreakdownComponents(base, addition).base.maxWin).toBe(100);
    });

    it("handles a zero-totalBet category without dividing by zero", () => {
        const base: Record<string, SimulationBreakdownComponent> = {
            freeGames: {rounds: 5, totalBet: 0, totalWin: 25, rtp: 0, hitFrequency: 0.4, maxWin: 10},
        };
        const addition: Record<string, SimulationBreakdownComponent> = {
            freeGames: {rounds: 5, totalBet: 0, totalWin: 15, rtp: 0, hitFrequency: 0.2, maxWin: 8},
        };

        const merged = mergeBreakdownComponents(base, addition);

        expect(merged.freeGames.rtp).toBe(0);
        expect(merged.freeGames.totalWin).toBe(40);
        expect(merged.freeGames.rounds).toBe(10);
    });
});
