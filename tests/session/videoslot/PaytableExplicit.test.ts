import {Paytable} from "@fromstan/pokie";

describe("Paytable explicit payout mode", () => {
    it("keeps the legacy provisional ladder for constructor callers that do not opt out", () => {
        const paytable = new Paytable([1], ["A", "M"], [], 5);

        expect(paytable.getWinAmountForSymbol("A", 3, 1)).toBe(1);
        expect(paytable.getWinAmountForSymbol("M", 3, 1)).toBe(1);
    });

    it("declares symbols without inventing payouts in explicit mode", () => {
        const paytable = Paytable.explicit([1], ["A", "M"], []);

        expect(paytable.getWinAmountForSymbol("A", 3, 1)).toBe(0);
        expect(paytable.getWinAmountForSymbol("M", 3, 1)).toBe(0);
        expect(paytable.getNumbersOfSymbolsForBet(1, "M")).toEqual([]);
    });

    it("pays exactly the symbols authored after explicit construction", () => {
        const paytable = Paytable.explicit([1, 2], ["A", "M"], []);
        paytable.setPayoutForSymbol("A", 3, 5);

        expect(paytable.getWinAmountForSymbol("A", 3, 1)).toBe(5);
        expect(paytable.getWinAmountForSymbol("A", 3, 2)).toBe(10);
        expect(paytable.getWinAmountForSymbol("M", 3, 1)).toBe(0);
    });
});
