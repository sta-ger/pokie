import {DefaultValueWinCalculator, SymbolsCombination} from "pokie";

describe("DefaultValueWinCalculator", () => {
    test("pays every occurrence of a valued symbol independently, unlike a count-tiered paytable lookup", () => {
        const calculator = new DefaultValueWinCalculator<string>({VALUE_5: 5, VALUE_10: 10});
        const bet = 2;

        // Reel-major grid: two occurrences of VALUE_5, one of VALUE_10.
        const combination = new SymbolsCombination().fromMatrix([
            ["VALUE_5", "K", "VALUE_10"],
            ["K", "VALUE_5", "K"],
            ["K", "K", "K"],
        ]);

        const winningValues = calculator.calculateWinningValues(bet, combination);
        expect(Object.keys(winningValues)).toHaveLength(2);
        expect(winningValues.VALUE_5.getSymbolsPositions()).toHaveLength(2);
        expect(winningValues.VALUE_5.getWinAmount()).toBe(2 * 5 * bet);
        expect(winningValues.VALUE_10.getSymbolsPositions()).toHaveLength(1);
        expect(winningValues.VALUE_10.getWinAmount()).toBe(1 * 10 * bet);
    });

    test("ignores symbols with no configured value and symbols absent from the grid", () => {
        const calculator = new DefaultValueWinCalculator<string>({VALUE_5: 5, VALUE_100: 100});
        const bet = 1;

        const combination = new SymbolsCombination().fromMatrix([["K", "Q", "J"]]);

        expect(calculator.calculateWinningValues(bet, combination)).toEqual({});
    });

    test("skips a configured value of zero", () => {
        const calculator = new DefaultValueWinCalculator<string>({VALUE_0: 0});
        const bet = 1;

        const combination = new SymbolsCombination().fromMatrix([["VALUE_0", "VALUE_0"]]);

        expect(calculator.calculateWinningValues(bet, combination)).toEqual({});
    });
});
