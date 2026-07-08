import {WaysWinCalculator, SymbolsCombination, VideoSlotConfig} from "pokie";

describe("WaysWinCalculator", () => {
    test("pays a symbol matching across consecutive reels, scaled by the ways count", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const calculator = new WaysWinCalculator(config);
        const bet = config.getAvailableBets()[0];

        // Reel-major grid (combination[reelId][rowIndex]). "A" chains across all 3 reels
        // (2*1*1 = 2 ways); the filler symbols ("K", "Q", "J") each sit on only one reel, so none
        // of them ever chain from reel0 and none of them produce a win of their own.
        const combination = new SymbolsCombination().fromMatrix([
            ["A", "A", "K"],
            ["A", "Q", "Q"],
            ["A", "J", "J"],
        ]);

        const winningWays = calculator.calculateWinningWays(bet, combination);
        expect(Object.keys(winningWays)).toEqual(["A"]);
        expect(winningWays.A.getWaysCount()).toBe(2);
        expect(winningWays.A.getSymbolsPositions()).toHaveLength(4);
        expect(winningWays.A.getWinAmount()).toBe(
            config.getPaytable().getWinAmountForSymbol("A", 3, bet) * 2,
        );
        expect(winningWays.A.getWinAmount()).toBeGreaterThan(0);
    });

    test("does not pay a symbol absent from the first reel", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const calculator = new WaysWinCalculator(config);
        const bet = config.getAvailableBets()[0];

        // "A" is absent from reel0 -> excluded outright. "K" is on reel0 but nowhere else, so it
        // only matches 1 reel — below the paytable's minimum of 3 — and pays nothing either.
        const combination = new SymbolsCombination().fromMatrix([
            ["K", "K", "K"],
            ["A", "A", "A"],
            ["A", "A", "A"],
        ]);

        expect(calculator.calculateWinningWays(bet, combination)).toEqual({});
    });

    test("excludes wild and scatter symbols from ways evaluation", () => {
        const config = new VideoSlotConfig();
        config.setReelsNumber(3);
        const bet = config.getAvailableBets()[0];
        const calculator = new WaysWinCalculator(config);

        // an all-wild, all-scatter grid should never produce a "winning way" for W or S themselves
        const combination = new SymbolsCombination().fromMatrix([
            ["W", "W", "W"],
            ["S", "S", "S"],
            ["W", "S", "W"],
        ]);

        const winningWays = calculator.calculateWinningWays(bet, combination);
        expect(winningWays.W).toBeUndefined();
        expect(winningWays.S).toBeUndefined();
    });
});
