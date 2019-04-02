import {ReelGameSessionWinCalculator} from "./ReelGameSessionWinCalculator";
import {ReelGameSessionConfig} from "../ReelGameSessionConfig";
import {ReelGameSessionReelsController} from "../reelscontroller/ReelGameSessionReelsController";
import {IReelGameSessionWinningLineModel} from "./IReelGameSessionWinningLineModel";

describe("ReelGameSessionWinCalculator", () => {
    let config = new ReelGameSessionConfig(5, 3);
    let winningCalculator = new ReelGameSessionWinCalculator(config);
    let lines: { [lineId: string]: IReelGameSessionWinningLineModel };

    const testWinning = (bet, lines) => {
        Object.keys(lines).forEach(lineId => {
            expect(lines[lineId].winningAmount).toBe(config.paytable[bet][lines[lineId].itemId][lines[lineId].itemsPositions.length] * (config.wildsMultipliers.hasOwnProperty(lines[lineId].wildItemsPositions.length) ? config.wildsMultipliers[lines[lineId].wildItemsPositions.length] : 1));
        });
    };
    const testItemsPositions = (line: IReelGameSessionWinningLineModel, expectedItemsPositionsLength) => {
        expect(line.itemsPositions).toHaveLength(expectedItemsPositionsLength);
    };
    const testWildItemsPositions = (line: IReelGameSessionWinningLineModel, expectedItemsPositionsLength) => {
        expect(line.wildItemsPositions).toHaveLength(expectedItemsPositionsLength);
    };

    it("creates lines patterns", () => {
        let patterns = ReelGameSessionWinCalculator.createLinesPatterns(5);
        expect(patterns).toEqual([
            [1, 1, 1, 1, 1],
            [1, 1, 1, 1, 0],
            [1, 1, 1, 0, 0],
            [1, 1, 0, 0, 0]
        ]);
    });

    it("returns items matching pattern", () => {
        expect(ReelGameSessionWinCalculator.getItemsMatchingPattern(["A", "A", "A", "K", "Q",], [1, 1, 1, 0, 0])).toEqual(["A", "A", "A"]);
        expect(ReelGameSessionWinCalculator.getItemsMatchingPattern(["A", "A", "A", "K", "Q",], [0, 1, 1, 1, 0])).toEqual(["A", "A", "K"]);
        expect(ReelGameSessionWinCalculator.getItemsMatchingPattern(["A", "A", "A", "K", "Q",], [0, 0, 1, 1, 1])).toEqual(["A", "K", "Q"]);
        expect(ReelGameSessionWinCalculator.getItemsMatchingPattern(["A", "A", "A", "K", "Q",], [0, 1, 0, 1, 0])).toEqual(["A", "K"]);
    });

    it("determines is items array matching pattern", () => {
        expect(ReelGameSessionWinCalculator.isMatchPattern(["A", "A", "A", "K", "Q",], [1, 1, 0, 0, 0])).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(["A", "A", "A", "K", "Q",], [1, 1, 1, 0, 0])).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(["A", "A", "A", "K", "Q",], [1, 1, 1, 1, 0])).toBeFalsy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(["A", "A", "A", "K", "Q",], [1, 1, 1, 1, 1])).toBeFalsy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(["A", "A", "A", "K", "Q",], [1, 0, 1, 0, 0])).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(["A", "A", "A", "K", "Q",], [1, 0, 1, 0, 1])).toBeFalsy();

        expect(ReelGameSessionWinCalculator.isMatchPattern(["A", "W", "K", "Q", "J",], [1, 1, 0, 0, 0], "W")).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(["W", "A", "K", "Q", "J",], [1, 1, 0, 0, 0], "W")).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(["A", "W", "W", "Q", "J",], [1, 1, 1, 0, 0], "W")).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(["A", "W", "W", "W", "J",], [1, 1, 1, 1, 0], "W")).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(["A", "W", "W", "W", "W",], [1, 1, 1, 1, 1], "W")).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(["W", "W", "K", "Q", "J",], [1, 1, 1, 0, 0], "W")).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(["W", "W", "W", "K", "Q",], [1, 1, 1, 1, 0], "W")).toBeTruthy();
        expect(ReelGameSessionWinCalculator.isMatchPattern(["W", "W", "W", "W", "K",], [1, 1, 1, 1, 1], "W")).toBeTruthy();
    });

    it("extracts proper items from direction", () => {
        expect(ReelGameSessionWinCalculator.getItemsFromDirection(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"]
        ]), [0, 0, 0, 0, 0])).toEqual(["A", "A", "A", "K", "Q"]);
        expect(ReelGameSessionWinCalculator.getItemsFromDirection(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"]
        ]), [1, 1, 1, 1, 1])).toEqual(["A", "K", "Q", "J", "10"]);
        expect(ReelGameSessionWinCalculator.getItemsFromDirection(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"]
        ]), [2, 2, 2, 2, 2])).toEqual(["K", "Q", "J", "10", "9"]);
        expect(ReelGameSessionWinCalculator.getItemsFromDirection(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"]
        ]), [0, 1, 2, 1, 0])).toEqual(["A", "K", "J", "J", "Q"]);
        expect(ReelGameSessionWinCalculator.getItemsFromDirection(ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"]
        ]), [2, 0, 1, 2, 0])).toEqual(["K", "A", "Q", "10", "Q"]);
    });

    it("updates game state", () => {
        expect(() => winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "A", "A"],
            ["A", "A", "A", "A", "A"],
            ["A", "A", "A", "A", "A"]
        ]))).not.toThrow();
        expect(() => winningCalculator.setGameState(0, ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "A", "A"],
            ["A", "A", "A", "A", "A"],
            ["A", "A", "A", "A", "A"]
        ]))).toThrow();
    });

    it("calculates winning lines", () => {

        config.availableBets.forEach(bet => {
            config.availableItems.forEach(item => {
                if (
                    config.isItemWild(item) && config.isItemScatter(item)
                ) {
                    winningCalculator.setGameState(bet, ReelGameSessionReelsController.transposeMatrix([
                        [item, item, item, item, item],
                        [item, item, item, item, item],
                        [item, item, item, item, item]
                    ]));
                    lines = winningCalculator.getWinningLines();
                    expect(Object.keys(lines)).toHaveLength(3);
                    expect(Object.keys(lines)).toEqual(["0", "1", "2"]);
                    testWinning(bet, lines);
                    testItemsPositions(lines["0"], 3);
                    testItemsPositions(lines["1"], 3);
                    testItemsPositions(lines["2"], 3);
                }
            });
        });

        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "A", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"]
        ]));
        lines = winningCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines)).toEqual(["0"]);
        testWinning(1, lines);
        testItemsPositions(lines["0"], 3);
    });

    it("calculates winning lines with wilds", () => {

        winningCalculator.setGameState(1, ReelGameSessionReelsController.transposeMatrix([
            ["A", "W", "A", "K", "Q"],
            ["A", "K", "Q", "J", "10"],
            ["K", "Q", "J", "10", "9"]
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
            ["K", "Q", "J", "10", "9"]
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
            ["K", "Q", "J", "10", "9"]
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
            ["K", "Q", "J", "10", "9"]
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
            ["K", "Q", "J", "10", "9"]
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
            ["K", "Q", "J", "10", "9"]
        ]));
        lines = winningCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines)).toEqual(["0"]);
        testWinning(1, lines);
        testWildItemsPositions(lines["0"], 4);
        testItemsPositions(lines["0"], 5);
    });

});