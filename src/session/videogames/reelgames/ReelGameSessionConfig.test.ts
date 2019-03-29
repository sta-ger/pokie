import {ReelGameSessionConfig} from "./ReelGameSessionConfig";

describe("ReelGameSessionConfig", () => {

    it("creates a default config", () => {
        const conf: ReelGameSessionConfig = new ReelGameSessionConfig();
        expect(conf.wildItemId).toEqual("W");
        expect(conf.scatters).toEqual([["S", 3]]);
        expect(conf.reelsNumber).toEqual(5);
        expect(conf.reelsItemsNumber).toEqual(3);
        expect(conf.linesDirections).toEqual([
            [0, 0, 0, 0, 0],
            [1, 1, 1, 1, 1],
            [2, 2, 2, 2, 2]
        ]);
        expect(conf.reelsItemsSequences.length).toEqual(conf.reelsNumber);
        conf.reelsItemsSequences.forEach((seq: string[]) => {
            conf.availableItems.forEach(item => {
                //Check if every of available items exists on each sequence
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
            "S"
        ]);
    });

});