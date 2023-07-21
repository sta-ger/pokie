import {Paytable} from "pokie";

describe("DefaultVideoSlotSessionPaytableData", () => {
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
