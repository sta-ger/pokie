import {Paytable} from "pokie";
import {FRACTIONAL_BET_STAKES} from "../../fixtures/math/FractionalBetFixture.js";

describe("DefaultVideoSlotSessionPaytableData", () => {
    it.each([0.01, 1.5])("reproduces the direct core intake at stake %s", (bet) => {
        const data = new Paytable([bet], ["A"], [], 3);
        data.setPayoutForSymbol("A", 3, 5);
        const actual = {bets: data.getAvailableBets(), payout: data.getWinAmountForSymbol("A", 3, bet)};
        expect(actual).toEqual({bets: [bet], payout: 5 * bet});
    });

    it.each(FRACTIONAL_BET_STAKES)("preserves stake %s and exact multiplier semantics in all-bets updates", (bet) => {
        const data = new Paytable<string>([bet], ["A"], [], 4);
        expect(data.getAvailableBets()).toEqual([bet]);
        expect(data.getWinAmountForSymbol("A", 3, bet)).toBe(bet);
        expect(data.getWinAmountForSymbol("A", 4, bet)).toBe(2 * bet);
        for (const multiplier of [5, 0, 0.25, 7.5, 5]) {
            data.setPayoutForSymbol("A", 3, multiplier);
            expect(data.getWinAmountForSymbol("A", 3, bet)).toBe(multiplier * bet);
        }
        expect(data.getWinAmountForSymbol("missing", 3, bet)).toBe(0);
        expect(data.getWinAmountForSymbol("A", 9, bet)).toBe(0);
        expect(data.getWinAmountForSymbol("A", 3, 99)).toBe(0);
    });

    it.each(FRACTIONAL_BET_STAKES)("updates only selected stake %s independently of the all-bets setter", (selected) => {
        const data = new Paytable(FRACTIONAL_BET_STAKES, ["A"], [], 3);
        for (const multiplier of [5, 0, 0.25, 7.5]) {
            const before = data.toMap();
            data.setPayoutForSymbol("A", 3, multiplier, selected);
            for (const bet of FRACTIONAL_BET_STAKES) {
                expect(data.getWinAmountForSymbol("A", 3, bet)).toBe(bet === selected ? multiplier * bet : before[bet].A[3]);
            }
        }
    });

    it("keeps mixed stake keys, selected updates, and detached JSON maps", () => {
        const data = new Paytable(FRACTIONAL_BET_STAKES, ["A"], [], 3);
        data.setPayoutForSymbol("A", 3, 5);
        expect(new Set(data.getAvailableBets())).toEqual(new Set(FRACTIONAL_BET_STAKES));
        for (const selected of FRACTIONAL_BET_STAKES) {
            const before = data.toMap();
            data.setPayoutForSymbol("A", 3, 0.25, selected);
            for (const bet of FRACTIONAL_BET_STAKES) {
                expect(data.getWinAmountForSymbol("A", 3, bet)).toBe(bet === selected ? 0.25 * bet : before[bet].A[3]);
            }
        }
        data.setPayoutForSymbol("A", 3, 5);
        for (const bet of FRACTIONAL_BET_STAKES) expect(data.getWinAmountForSymbol("A", 3, bet)).toBe(5 * bet);
        const map = JSON.parse(JSON.stringify(data.toMap()));
        expect(Object.keys(map)).toContain("1e-7");
        const imported = new Paytable<string>([]).fromMap(map);
        expect(imported.toMap()).toEqual(data.toMap());
        expect(new Set(imported.getAvailableBets())).toEqual(new Set(FRACTIONAL_BET_STAKES));
        map[1e-7].A[3] = 999;
        const returned = imported.toMap();
        returned[0.01].A[3] = 999;
        expect(imported.getWinAmountForSymbol("A", 3, 1e-7)).toBe(5 * 1e-7);
        expect(imported.getWinAmountForSymbol("A", 3, 0.01)).toBe(0.05);
        expect(data.getWinAmountForSymbol("A", 3, 0.01)).toBe(0.05);
    });

    it("properly parses paytable data provided to its constructor", () => {
        const availableBets = [1, 2, 3, 4, 5];
        const availableSymbols = ["A", "B", "C", "D", "W"];
        const reelsNumber = 5;
        const wildSymbolId = ["W"];
        const data = new Paytable(availableBets, availableSymbols, wildSymbolId, reelsNumber);
        expect(data.getAvailableBets()).toEqual(availableBets);
        Object.keys(data.toMap()).forEach((bet) => {
            const intBet = parseInt(bet, 10);
            const symbolsForBet = Object.keys(data.toMap()[bet]);
            expect(data.getAvailableSymbolsForBet(intBet)).toEqual(symbolsForBet);
            symbolsForBet.forEach((symbolId) => {
                const numbersOfSymbolsForBet = Object.keys(data.toMap()[bet][symbolId]).map((num) => parseInt(num, 10));
                expect(data.getNumbersOfSymbolsForBet(intBet, symbolId)).toEqual(numbersOfSymbolsForBet);
                numbersOfSymbolsForBet.forEach((num) => {
                    expect(data.getWinAmountForSymbol(symbolId, num, intBet)).toBe(data.toMap()[bet][symbolId][num]);
                });
            });
        });
        expect(data.toMap()).toEqual(data.toMap());
        data.setPayoutForSymbol("A", 2, 1);
        data.setPayoutForSymbol("A", 3, 5);
        data.setPayoutForSymbol("A", 4, 10);
        data.setPayoutForSymbol("A", 5, 15);
        expect(data.getWinAmountForSymbol("A", 2, 5)).toBe(5);
        expect(data.getWinAmountForSymbol("A", 3, 5)).toBe(25);
        expect(data.getWinAmountForSymbol("A", 4, 5)).toBe(50);
        expect(data.getWinAmountForSymbol("A", 5, 5)).toBe(75);
        data.setPayoutForSymbol("A", 5, 10, 4);
        expect(data.getWinAmountForSymbol("A", 5, 5)).toBe(75);
        expect(data.getWinAmountForSymbol("A", 5, 4)).toBe(40);

        const map = data.toMap();
        map[1]["A"][3] = 999;
        expect(data.fromMap(map).toMap()).toEqual(map);
    });
});
