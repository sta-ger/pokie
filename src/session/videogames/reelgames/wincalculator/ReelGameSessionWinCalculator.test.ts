import {ReelGameSessionWinCalculator} from "./ReelGameSessionWinCalculator";
import {ReelGameSessionConfig} from "../ReelGameSessionConfig";
import {ReelGameSessionReelsController} from "../../../..";
import {IReelGameSessionWinningLineModel} from "./IReelGameSessionWinningLineModel";
import {IReelGameSessionWinningScatterModel} from "./IReelGameSessionWinningScatterModel";

describe("ReelGameSessionWinCalculator", () => {
    const config = new ReelGameSessionConfig(5, 3);
    const winningCalculator = new ReelGameSessionWinCalculator(config);
    let lines: { [lineId: string]: IReelGameSessionWinningLineModel };
    let scatters: { [scatterId: string]: IReelGameSessionWinningScatterModel };

    const testWinning = (bet: number, winningLines: { [lineId: string]: IReelGameSessionWinningLineModel }) => {
        Object.values(winningLines).forEach((line) => {
            expect(line.winningAmount)
                .toBe(config.paytable[bet][line.itemId][line.itemsPositions.length]
                    * (config.wildsMultipliers.hasOwnProperty(line.wildItemsPositions.length)
                        ? config.wildsMultipliers[line.wildItemsPositions.length] : 1));
        });
    };
    const testItemsPositions = (line: IReelGameSessionWinningLineModel, expectedItemsPositionsLength: number) => {
        expect(line.itemsPositions).toHaveLength(expectedItemsPositionsLength);
    };
    const testWildItemsPositions = (line: IReelGameSessionWinningLineModel, expectedItemsPositionsLength: number) => {
        expect(line.wildItemsPositions).toHaveLength(expectedItemsPositionsLength);
    };

    it("creates lines patterns", () => {
        const patterns = ReelGameSessionWinCalculator.createLinesPatterns(5);
        expect(patterns).toEqual([
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 0],
            [1, 1, 1, 0, 0],
            [1, 1, 0, 0, 0],
        ]);
    });

    it("returns items matching pattern", () => {
        expect(ReelGameSessionWinCalculator.getItemsMatchingPattern(
            ["A", "A", "A", "K", "Q"], [1, 1, 1, 0, 0],
        )).toEqual(["A", "A", "A"]);
        expect(ReelGameSessionWinCalculator.getItemsMatchingPattern(
            ["A", "A", "A", "K", "Q"], [0, 1, 1, 1, 0],
        )).toEqual(["A", "A", "K"]);
        expect(ReelGameSessionWinCalculator.getItemsMatchingPattern(
            ["A", "A", "A", "K", "Q"], [0, 0, 1, 1, 1],
        )).toEqual(["A", "K", "Q"]);
        expect(ReelGameSessionWinCalculator.getItemsMatchingPattern(
            ["A", "A", "A", "K", "Q"], [0, 1, 0, 1, 0],
        )).toEqual(["A", "K"]);
    });

    it("determines is items array matching pattern", () => {
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["A", "A", "A", "K", "Q"], [1, 1, 0, 0, 0],
        )).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["A", "A", "A", "K", "Q"], [1, 1, 1, 0, 0],
        )).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["A", "A", "A", "K", "Q"], [1, 1, 1, 1, 0],
        )).toBeFalsy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["A", "A", "A", "K", "Q"], [1, 1, 1, 1, 1],
        )).toBeFalsy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["A", "A", "A", "K", "Q"], [1, 0, 1, 0, 0],
        )).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["A", "A", "A", "K", "Q"], [1, 0, 1, 0, 1],
        )).toBeFalsy();

        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["A", "W", "K", "Q", "J"], [1, 1, 0, 0, 0], "W",
        )).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["W", "A", "K", "Q", "J"], [1, 1, 0, 0, 0], "W",
        )).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["A", "W", "W", "Q", "J"], [1, 1, 1, 0, 0], "W",
        )).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["A", "W", "W", "W", "J"], [1, 1, 1, 1, 0], "W",
        )).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["A", "W", "W", "W", "W"], [1, 1, 1, 1, 1], "W",
        )).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["W", "W", "K", "Q", "J"], [1, 1, 1, 0, 0], "W",
        )).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["W", "W", "W", "K", "Q"], [1, 1, 1, 1, 0], "W",
        )).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["W", "W", "W", "W", "K"], [1, 1, 1, 1, 1], "W",
        )).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["W", "W", "K", "W", "K"], [1, 1, 1, 1, 1], "W",
        )).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["K", "W", "K", "W", "K"], [1, 1, 1, 1, 1], "W",
        )).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(
            ["K", "W", "A", "W", "K"], [1, 1, 1, 1, 1], "W",
        )).toBeFalsy();
    });

    it("determines which item is winning", () => {
        expect(ReelGameSessionWinCalculator.getWinningItemId(
            ["A", "A", "A", "K", "Q"], [1, 1, 1, 0, 0],
        )).toBe("A");
        expect(ReelGameSessionWinCalculator.getWinningItemId(
            ["A", "W", "A", "K", "Q"], [1, 1, 1, 0, 0], "W",
        )).toBe("A");
        expect(ReelGameSessionWinCalculator.getWinningItemId(
            ["A", "W", "W", "K", "Q"], [1, 1, 1, 0, 0], "W",
        )).toBe("A");
        expect(ReelGameSessionWinCalculator.getWinningItemId(
            ["W", "W", "A", "K", "Q"], [1, 1, 1, 0, 0], "W",
        )).toBe("A");
        expect(ReelGameSessionWinCalculator.getWinningItemId(
            ["W", "A", "A", "K", "Q"], [1, 1, 1, 0, 0], "W",
        )).toBe("A");
        expect(ReelGameSessionWinCalculator.getWinningItemId(
            ["W", "A", "W", "K", "Q"], [1, 1, 1, 0, 0], "W",
        )).toBe("A");
    });

    it("determines which pattern the line match to", () => {
        const patterns = ReelGameSessionWinCalculator.createLinesPatterns(5);
        expect(ReelGameSessionWinCalculator.getMatchingPattern(
            ["A", "A", "K", "Q", "J"], patterns,
        )).toEqual([1, 1, 0, 0, 0]);
        expect(ReelGameSessionWinCalculator.getMatchingPattern(
            ["A", "A", "A", "K", "Q"], patterns,
        )).toEqual([1, 1, 1, 0, 0]);
        expect(ReelGameSessionWinCalculator.getMatchingPattern(
            ["A", "A", "A", "A", "Q"], patterns,
        )).toEqual([1, 1, 1, 1, 0]);
        expect(ReelGameSessionWinCalculator.getMatchingPattern(
            ["A", "A", "A", "A", "A"], patterns,
        )).toEqual([1, 1, 1, 1, 1]);
        expect(ReelGameSessionWinCalculator.getMatchingPattern(
            ["A", "W", "A", "W", "A"], patterns, "W",
        )).toEqual([1, 1, 1, 1, 1]);
        expect(ReelGameSessionWinCalculator.getMatchingPattern(
            ["W", "W", "A", "W", "K"], patterns, "W",
        )).toEqual([1, 1, 1, 1, 0]);
        expect(ReelGameSessionWinCalculator.getMatchingPattern(
            ["A", "W", "A", "W", "K"], patterns, "W",
        )).toEqual([1, 1, 1, 1, 0]);
    });

    it("determines wild items positions on line", () => {
        expect(ReelGameSessionWinCalculator.getWildItemsPositions(
            ["A", "W", "K", "Q", "J"], [1, 1, 0, 0, 0], "W",
        )).toEqual([1]);
        expect(ReelGameSessionWinCalculator.getWildItemsPositions(
            ["W", "A", "K", "Q", "J"], [1, 1, 0, 0, 0], "W",
        )).toEqual([0]);
        expect(ReelGameSessionWinCalculator.getWildItemsPositions(
            ["A", "W", "W", "Q", "J"], [1, 1, 1, 0, 0], "W",
        )).toEqual([1, 2]);
        expect(ReelGameSessionWinCalculator.getWildItemsPositions(
            ["A", "W", "W", "W", "J"], [1, 1, 1, 1, 0], "W",
        )).toEqual([1, 2, 3]);
        expect(ReelGameSessionWinCalculator.getWildItemsPositions(
            ["A", "W", "W", "W", "W"], [1, 1, 1, 1, 1], "W",
        )).toEqual([1, 2, 3, 4]);
        expect(ReelGameSessionWinCalculator.getWildItemsPositions(
            ["W", "W", "K", "Q", "J"], [1, 1, 1, 0, 0], "W",
        )).toEqual([0, 1]);
        expect(ReelGameSessionWinCalculator.getWildItemsPositions(
            ["W", "W", "W", "K", "Q"], [1, 1, 1, 1, 0], "W",
        )).toEqual([0, 1, 2]);
        expect(ReelGameSessionWinCalculator.getWildItemsPositions(
            ["W", "W", "W", "W", "K"], [1, 1, 1, 1, 1], "W",
        )).toEqual([0, 1, 2, 3]);
        expect(ReelGameSessionWinCalculator.getWildItemsPositions(
            ["W", "W", "K", "W", "K"], [1, 1, 1, 1, 1], "W",
        )).toEqual([0, 1, 3]);
        expect(ReelGameSessionWinCalculator.getWildItemsPositions(
            ["K", "W", "K", "W", "K"], [1, 1, 1, 1, 1], "W",
        )).toEqual([1, 3]);
    });

    it("determines scatter items positions", () => {
        expect(ReelGameSessionWinCalculator.getScatterItemsPositions(
            ReelGameSessionReelsController.transposeMatrix([
                ["A", "K", "Q", "J", "10"],
                ["S", "S", "Q", "J", "S"],
                ["A", "K", "S", "J", "10"],
            ]), "S")).toEqual([
            [0, 1],
            [1, 1],
            [2, 2],
            [4, 1],
        ]);
    });

    it("determines winning lines for items combination", () => {
        const directions = {
            0: [1, 1, 1],
            1: [0, 0, 0],
            2: [2, 2, 2],
            3: [0, 1, 2],
            4: [2, 1, 0],
        };
        const patterns = ReelGameSessionWinCalculator.createLinesPatterns(3);
        expect(ReelGameSessionWinCalculator.getWinningLinesIds(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A"],
            ["K", "Q", "J"],
            ["K", "Q", "J"],
        ]), directions, patterns)).toEqual(["1"]);
        expect(ReelGameSessionWinCalculator.getWinningLinesIds(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A"],
            ["K", "Q", "J"],
            ["A", "A", "A"],
        ]), directions, patterns)).toEqual(["1", "2"]);
        expect(ReelGameSessionWinCalculator.getWinningLinesIds(ReelGameSessionReelsController.transposeMatrix([
            ["K", "Q", "J"],
            ["A", "A", "A"],
            ["K", "Q", "J"],
        ]), directions, patterns)).toEqual(["0"]);
        expect(ReelGameSessionWinCalculator.getWinningLinesIds(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A"],
            ["A", "A", "A"],
            ["K", "Q", "J"],
        ]), directions, patterns)).toEqual(["0", "1", "3"]);
        expect(ReelGameSessionWinCalculator.getWinningLinesIds(ReelGameSessionReelsController.transposeMatrix([
            ["K", "Q", "J"],
            ["A", "A", "A"],
            ["A", "A", "A"],
        ]), directions, patterns)).toEqual(["0", "2", "4"]);
        expect(ReelGameSessionWinCalculator.getWinningLinesIds(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A"],
            ["A", "A", "A"],
            ["A", "A", "A"],
        ]), directions, patterns)).toEqual(["0", "1", "2", "3", "4"]);
    });

    it("extracts proper items from direction", () => {
        expect(ReelGameSessionWinCalculator.getItemsForDirection(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]), [0, 0, 0, 0, 0])).toEqual(["A", "A", "A", "K", "Q"]);
        expect(ReelGameSessionWinCalculator.getItemsForDirection(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]), [1, 1, 1, 1, 1])).toEqual(["A", "K", "Q", "J", "10"]);
        expect(ReelGameSessionWinCalculator.getItemsForDirection(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]), [2, 2, 2, 2, 2])).toEqual(["K", "Q", "J", "10", "9"]);
        expect(ReelGameSessionWinCalculator.getItemsForDirection(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]), [0, 1, 2, 1, 0])).toEqual(["A", "K", "J", "J", "Q"]);
        expect(ReelGameSessionWinCalculator.getItemsForDirection(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]), [2, 0, 1, 2, 0])).toEqual(["K", "A", "Q", "10", "Q"]);
    });

    it("updates game state", () => {
        expect(() => winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "A", "A"],
            ["A", "A", "A", "A", "A"],
            ["A", "A", "A", "A", "A"],
        ]))).not.toThrow();
        expect(() => winningCalculator.setGameState(0, ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "A", "A"],
            ["A", "A", "A", "A", "A"],
            ["A", "A", "A", "A", "A"],
        ]))).toThrow();
    });

    it("calculates winning lines", () => {

        config.availableBets.forEach((bet) => {
            config.availableItems.forEach((item) => {
                if (
                    !config.isItemWild(item) && !config.isItemScatter(item)
                ) {
                    winningCalculator.setGameState(bet, ReelGameSessionReelsController.transposeMatrix([
                        [item, item, item, item, item],
                        [item, item, item, item, item],
                        [item, item, item, item, item],
                    ]));
                    lines = winningCalculator.getWinningLines();
                    expect(Object.keys(lines)).toHaveLength(3);
                    expect(Object.keys(lines)).toEqual(["0", "1", "2"]);
                    testWinning(bet, lines);
                    testItemsPositions(lines["0"], 5);
                    testItemsPositions(lines["1"], 5);
                    testItemsPositions(lines["2"], 5);
                }
            });
        });

        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]));
        lines = winningCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines)).toEqual(["0"]);
        testWinning(1, lines);
        testItemsPositions(lines["0"], 3);
    });

    it("does not create a line of scatter symbols", () => {
        const conf: ReelGameSessionConfig = new ReelGameSessionConfig();
        conf.scatters = [
            ["A", 3]
        ];
        const calc: ReelGameSessionWinCalculator = new ReelGameSessionWinCalculator(conf);

        calc.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"]
        ]));
        lines = calc.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(0);
    });

    it("calculates winning lines with wilds", () => {

        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "W", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]));
        lines = winningCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines)).toEqual(["0"]);
        testWinning(1, lines);
        testWildItemsPositions(lines["0"], 1);
        testItemsPositions(lines["0"], 3);

        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "W", "W", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]));
        lines = winningCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines)).toEqual(["0"]);
        testWinning(1, lines);
        testWildItemsPositions(lines["0"], 2);
        testItemsPositions(lines["0"], 3);

        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "W", "W", "W", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]));
        lines = winningCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines)).toEqual(["0"]);
        testWinning(1, lines);
        testWildItemsPositions(lines["0"], 3);
        testItemsPositions(lines["0"], 4);

        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "W", "W", "W", "W"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]));
        lines = winningCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines)).toEqual(["0"]);
        testWinning(1, lines);
        testWildItemsPositions(lines["0"], 4);
        testItemsPositions(lines["0"], 5);

        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["W", "W", "W", "W", "A"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]));
        lines = winningCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines)).toEqual(["0"]);
        testWinning(1, lines);
        testWildItemsPositions(lines["0"], 4);
        testItemsPositions(lines["0"], 5);

        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["W", "W", "A", "W", "W"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]));
        lines = winningCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines)).toEqual(["0"]);
        testWinning(1, lines);
        testWildItemsPositions(lines["0"], 4);
        testItemsPositions(lines["0"], 5);

        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["W", "W", "W", "W", "W"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]));
        lines = winningCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(0);
    });

    it("calculates winning scatters", () => {
        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "S", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]));
        scatters = winningCalculator.getWinningScatters();
        expect(Object.keys(scatters)).toHaveLength(0);

        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "S", "A", "K", "Q"],
            ["A", "K", "S", "J", "10"],
            ["K", "Q", "J", "10", "9"],
        ]));
        scatters = winningCalculator.getWinningScatters();
        expect(Object.keys(scatters)).toHaveLength(0);

        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "S", "A", "K", "Q"],
            ["A", "K", "S", "J", "10"],
            ["K", "Q", "J", "10", "S"],
        ]));
        scatters = winningCalculator.getWinningScatters();
        expect(Object.keys(scatters)).toHaveLength(1);
        expect(scatters["S"].winningAmount)
            .toBe(config.paytable[1][scatters["S"].itemId][scatters["S"].itemsPositions.length]);
    });

    it("calculates all lines win amount", () => {
        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "A", "A"],
            ["A", "A", "A", "K", "Q"],
            ["A", "A", "K", "Q", "J"],
        ]));
        expect(winningCalculator.getLinesWinning()).toBeGreaterThan(0);
    });

    it("calculates all scatters win amount", () => {
        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "A", "A"],
            ["A", "A", "A", "S", "S"],
            ["A", "A", "K", "Q", "S"],
        ]));
        expect(winningCalculator.getScattersWinning()).toBeGreaterThan(0);
    });

    it("calculates total win amount", () => {
        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "A", "A"],
            ["A", "A", "A", "S", "S"],
            ["A", "A", "K", "Q", "S"],
        ]));
        expect(winningCalculator.getWinningAmount()).toBeGreaterThan(0);
    });

});
