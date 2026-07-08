import {ResizableSymbolsCombinationsGenerator, SeededRandomNumberGenerator, SymbolsSequence, VideoSlotConfig} from "pokie";

describe("ResizableSymbolsCombinationsGenerator", () => {
    const availableSymbols: string[] = ["A", "K", "Q", "J", "10", "9"];
    const REELS_NUMBER = 3;

    const buildConfig = () => {
        const conf = new VideoSlotConfig();
        conf.setReelsNumber(REELS_NUMBER);
        conf.setAvailableSymbols(availableSymbols);
        conf.setSymbolsSequences(
            new Array(REELS_NUMBER)
                .fill(0)
                .map(() => new SymbolsSequence().fromNumberOfEachSymbol(availableSymbols, 10)),
        );
        return conf;
    };

    test("draws exactly the configured height per reel", () => {
        const conf = buildConfig();
        const generator = new ResizableSymbolsCombinationsGenerator(conf, [2, 5, 7]);

        const matrix = generator.generateSymbolsCombination().toMatrix();
        expect(matrix).toHaveLength(REELS_NUMBER);
        expect(matrix[0]).toHaveLength(2);
        expect(matrix[1]).toHaveLength(5);
        expect(matrix[2]).toHaveLength(7);
        matrix.forEach((reelSymbols) => reelSymbols.forEach((symbol) => expect(availableSymbols).toContain(symbol)));
    });

    test("setReelsHeights changes the shape of the next generated grid, in either direction", () => {
        const conf = buildConfig();
        const generator = new ResizableSymbolsCombinationsGenerator(conf, [3, 3, 3]);

        // grow reel0, shrink reel2, leave reel1 unchanged
        generator.setReelsHeights([5, 3, 1]);
        expect(generator.getReelsHeights()).toEqual([5, 3, 1]);

        const matrix = generator.generateSymbolsCombination().toMatrix();
        expect(matrix[0]).toHaveLength(5);
        expect(matrix[1]).toHaveLength(3);
        expect(matrix[2]).toHaveLength(1);
    });

    test("getReelsHeights returns a defensive copy", () => {
        const conf = buildConfig();
        const generator = new ResizableSymbolsCombinationsGenerator(conf, [3, 3, 3]);

        const heights = generator.getReelsHeights();
        heights[0] = 999;

        expect(generator.getReelsHeights()).toEqual([3, 3, 3]);
    });

    test("getLastStopPositions still reports the per-reel stop position that produced the combination", () => {
        const conf = buildConfig();
        const generator = new ResizableSymbolsCombinationsGenerator(conf, [3, 3, 3], new SeededRandomNumberGenerator(7));

        const combination = generator.generateSymbolsCombination();
        const stopPositions = generator.getLastStopPositions();

        expect(stopPositions).toHaveLength(REELS_NUMBER);
        stopPositions.forEach((position, reelId) => {
            expect(conf.getSymbolsSequences()[reelId].getSymbols(position, 3)).toEqual(combination.toMatrix()[reelId]);
        });
    });
});
