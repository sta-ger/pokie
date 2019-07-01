import {ReelGameSessionConfig} from "./ReelGameSessionConfig";
import {IReelGameSessionConfig} from "./IReelGameSessionConfig";

describe("ReelGameSessionConfig", () => {

    it("creates default config", () => {
        const conf: ReelGameSessionConfig = new ReelGameSessionConfig();
        expect(conf.wildItemId).toEqual("W");
        expect(conf.wildsMultipliers).toEqual({1: 2, 2: 4, 3: 6, 4: 8});
        expect(conf.scatters).toEqual([["S", 3]]);
        expect(conf.reelsNumber).toEqual(5);
        expect(conf.reelsItemsNumber).toEqual(3);
        expect(conf.linesDirections).toEqual({
            0: [0, 0, 0, 0, 0],
            1: [1, 1, 1, 1, 1],
            2: [2, 2, 2, 2, 2],
        });
        expect(conf.reelsItemsSequences.length).toEqual(conf.reelsNumber);
        conf.reelsItemsSequences.forEach((seq: string[]) => {
            conf.availableItems.forEach((item: string) => {
                // Check if every of available items exists on each sequence
                expect(seq.indexOf(item)).toBeGreaterThanOrEqual(0);
            });
        });
        expect(conf.availableItems).toEqual([
            "A",
            "K",
            "Q",
            "J",
            "10",
            "9",
            "W",
            "S",
        ]);
        expect(conf.paytable).toEqual({
            1:
                {
                    9: {3: 1, 4: 2, 5: 3},
                    10: {3: 1, 4: 2, 5: 3},
                    A: {3: 1, 4: 2, 5: 3},
                    K: {3: 1, 4: 2, 5: 3},
                    Q: {3: 1, 4: 2, 5: 3},
                    J: {3: 1, 4: 2, 5: 3},
                    S: {3: 1, 4: 2, 5: 3},
                },
            2:
                {
                    9: {3: 2, 4: 4, 5: 6},
                    10: {3: 2, 4: 4, 5: 6},
                    A: {3: 2, 4: 4, 5: 6},
                    K: {3: 2, 4: 4, 5: 6},
                    Q: {3: 2, 4: 4, 5: 6},
                    J: {3: 2, 4: 4, 5: 6},
                    S: {3: 2, 4: 4, 5: 6},
                },
            3:
                {
                    9: {3: 3, 4: 6, 5: 9},
                    10: {3: 3, 4: 6, 5: 9},
                    A: {3: 3, 4: 6, 5: 9},
                    K: {3: 3, 4: 6, 5: 9},
                    Q: {3: 3, 4: 6, 5: 9},
                    J: {3: 3, 4: 6, 5: 9},
                    S: {3: 3, 4: 6, 5: 9},
                },
            4:
                {
                    9: {3: 4, 4: 8, 5: 12},
                    10: {3: 4, 4: 8, 5: 12},
                    A: {3: 4, 4: 8, 5: 12},
                    K: {3: 4, 4: 8, 5: 12},
                    Q: {3: 4, 4: 8, 5: 12},
                    J: {3: 4, 4: 8, 5: 12},
                    S: {3: 4, 4: 8, 5: 12},
                },
            5:
                {
                    9: {3: 5, 4: 10, 5: 15},
                    10: {3: 5, 4: 10, 5: 15},
                    A: {3: 5, 4: 10, 5: 15},
                    K: {3: 5, 4: 10, 5: 15},
                    Q: {3: 5, 4: 10, 5: 15},
                    J: {3: 5, 4: 10, 5: 15},
                    S: {3: 5, 4: 10, 5: 15},
                },
            10:
                {
                    9: {3: 10, 4: 20, 5: 30},
                    10: {3: 10, 4: 20, 5: 30},
                    A: {3: 10, 4: 20, 5: 30},
                    K: {3: 10, 4: 20, 5: 30},
                    Q: {3: 10, 4: 20, 5: 30},
                    J: {3: 10, 4: 20, 5: 30},
                    S: {3: 10, 4: 20, 5: 30},
                },
            20:
                {
                    9: {3: 20, 4: 40, 5: 60},
                    10: {3: 20, 4: 40, 5: 60},
                    A: {3: 20, 4: 40, 5: 60},
                    K: {3: 20, 4: 40, 5: 60},
                    Q: {3: 20, 4: 40, 5: 60},
                    J: {3: 20, 4: 40, 5: 60},
                    S: {3: 20, 4: 40, 5: 60},
                },
            30:
                {
                    9: {3: 30, 4: 60, 5: 90},
                    10: {3: 30, 4: 60, 5: 90},
                    A: {3: 30, 4: 60, 5: 90},
                    K: {3: 30, 4: 60, 5: 90},
                    Q: {3: 30, 4: 60, 5: 90},
                    J: {3: 30, 4: 60, 5: 90},
                    S: {3: 30, 4: 60, 5: 90},
                },
            40:
                {
                    9: {3: 40, 4: 80, 5: 120},
                    10: {3: 40, 4: 80, 5: 120},
                    A: {3: 40, 4: 80, 5: 120},
                    K: {3: 40, 4: 80, 5: 120},
                    Q: {3: 40, 4: 80, 5: 120},
                    J: {3: 40, 4: 80, 5: 120},
                    S: {3: 40, 4: 80, 5: 120},
                },
            50:
                {
                    9: {3: 50, 4: 100, 5: 150},
                    10: {3: 50, 4: 100, 5: 150},
                    A: {3: 50, 4: 100, 5: 150},
                    K: {3: 50, 4: 100, 5: 150},
                    Q: {3: 50, 4: 100, 5: 150},
                    J: {3: 50, 4: 100, 5: 150},
                    S: {3: 50, 4: 100, 5: 150},
                },
            100:
                {
                    9: {3: 100, 4: 200, 5: 300},
                    10: {3: 100, 4: 200, 5: 300},
                    A: {3: 100, 4: 200, 5: 300},
                    K: {3: 100, 4: 200, 5: 300},
                    Q: {3: 100, 4: 200, 5: 300},
                    J: {3: 100, 4: 200, 5: 300},
                    S: {3: 100, 4: 200, 5: 300},
                },
        });
    });

    it("detects is item wild", () => {
        const conf: IReelGameSessionConfig = new ReelGameSessionConfig();
        expect(conf.isItemWild("W")).toBeTruthy();
        expect(conf.isItemWild("A")).toBeFalsy();
    });

    it("detects is item scatter", () => {
        const conf: IReelGameSessionConfig = new ReelGameSessionConfig();
        expect(conf.isItemScatter("S")).toBeTruthy();
        expect(conf.isItemScatter("A")).toBeFalsy();
    });

});
