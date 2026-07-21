import {SumWithMultiplierHoldAndWinPayoutAggregator, type LockedHoldAndWinSymbol} from "pokie";

describe("SumWithMultiplierHoldAndWinPayoutAggregator", () => {
    it("sums flat value amounts with no multiplier symbols present", () => {
        const aggregator = new SumWithMultiplierHoldAndWinPayoutAggregator<string>();
        const locked: LockedHoldAndWinSymbol<string>[] = [
            {position: [0, 0], symbolId: "C", effect: {kind: "value", amount: 10}},
            {position: [1, 0], symbolId: "C", effect: {kind: "value", amount: 25}},
        ];

        expect(aggregator.aggregate(locked, 2)).toBe(35);
    });

    it("multiplies the value sum by the product of every multiplier symbol's own factor", () => {
        const aggregator = new SumWithMultiplierHoldAndWinPayoutAggregator<string>();
        const locked: LockedHoldAndWinSymbol<string>[] = [
            {position: [0, 0], symbolId: "C", effect: {kind: "value", amount: 10}},
            {position: [1, 0], symbolId: "C", effect: {kind: "value", amount: 20}},
            {position: [2, 0], symbolId: "M", effect: {kind: "multiplier", factor: 2}},
            {position: [3, 0], symbolId: "M", effect: {kind: "multiplier", factor: 3}},
        ];

        // (10 + 20) * (2 * 3) = 180
        expect(aggregator.aggregate(locked, 1)).toBe(180);
    });

    it("interprets value amounts as flat credits by default, ignoring bet", () => {
        const aggregator = new SumWithMultiplierHoldAndWinPayoutAggregator<string>();
        const locked: LockedHoldAndWinSymbol<string>[] = [{position: [0, 0], symbolId: "C", effect: {kind: "value", amount: 10}}];

        expect(aggregator.aggregate(locked, 5)).toBe(10);
    });

    it("interprets value amounts as bet multiples when configured to", () => {
        const aggregator = new SumWithMultiplierHoldAndWinPayoutAggregator<string>(true);
        const locked: LockedHoldAndWinSymbol<string>[] = [{position: [0, 0], symbolId: "C", effect: {kind: "value", amount: 10}}];

        expect(aggregator.aggregate(locked, 5)).toBe(50);
    });

    it("returns 0 for an empty locked set", () => {
        const aggregator = new SumWithMultiplierHoldAndWinPayoutAggregator<string>();
        expect(aggregator.aggregate([], 5)).toBe(0);
    });
});
