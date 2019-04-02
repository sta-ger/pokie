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
            expect(lines[lineId].winningAmount).toBe(config.paytable[bet][lines[lineId].itemId][lines[lineId].itemsPositions.length] *  (config.wildsMultipliers.hasOwnProperty(lines[lineId].wildItemsPositions.length) ? config.wildsMultipliers[lines[lineId].wildItemsPositions.length] : 1));
        });
    };
    const testItemsPositions = (line: IReelGameSessionWinningLineModel, expectedItemsPositionsLength) => {
        expect(line.itemsPositions).toHaveLength(expectedItemsPositionsLength);
    };
    const testWildItemsPositions = (line: IReelGameSessionWinningLineModel, expectedItemsPositionsLength) => {
        expect(line.wildItemsPositions).toHaveLength(expectedItemsPositionsLength);
    };

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