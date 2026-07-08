import {
    SeededRandomNumberGenerator,
    SymbolsSequence,
    VariableHeightSymbolsCombinationsGenerator,
    VideoSlotConfig,
} from "pokie";

describe("VariableHeightSymbolsCombinationsGenerator", () => {
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

    test("draws a different height per reel from that reel's own weighted distribution", () => {
        const conf = buildConfig();
        const reelsHeightWeights = [
            new SymbolsSequence<number>().fromArray([2]),
            new SymbolsSequence<number>().fromArray([5]),
            new SymbolsSequence<number>().fromArray([7]),
        ];
        const generator = new VariableHeightSymbolsCombinationsGenerator(conf, reelsHeightWeights);

        const matrix = generator.generateSymbolsCombination().toMatrix();
        expect(matrix).toHaveLength(REELS_NUMBER);
        expect(matrix[0]).toHaveLength(2);
        expect(matrix[1]).toHaveLength(5);
        expect(matrix[2]).toHaveLength(7);
        matrix.forEach((reelSymbols) => reelSymbols.forEach((symbol) => expect(availableSymbols).toContain(symbol)));
    });

    test("getLastReelsHeights reports the exact height drawn for each reel, matching the grid shape", () => {
        const conf = buildConfig();
        const reelsHeightWeights = [
            new SymbolsSequence<number>().fromArray([2, 3, 4]),
            new SymbolsSequence<number>().fromArray([5, 6]),
            new SymbolsSequence<number>().fromArray([7]),
        ];
        const generator = new VariableHeightSymbolsCombinationsGenerator(
            conf,
            reelsHeightWeights,
            new SeededRandomNumberGenerator(7),
        );

        const matrix = generator.generateSymbolsCombination().toMatrix();
        const heights = generator.getLastReelsHeights();

        expect(heights).toHaveLength(REELS_NUMBER);
        heights.forEach((height, reelId) => {
            expect(matrix[reelId]).toHaveLength(height);
            expect(reelsHeightWeights[reelId].toArray()).toContain(height);
        });
    });

    test("getLastStopPositions still reports the per-reel stop position that produced the combination", () => {
        const conf = buildConfig();
        const reelsHeightWeights = new Array(REELS_NUMBER)
            .fill(0)
            .map(() => new SymbolsSequence<number>().fromArray([3]));
        const generator = new VariableHeightSymbolsCombinationsGenerator(
            conf,
            reelsHeightWeights,
            new SeededRandomNumberGenerator(7),
        );

        const combination = generator.generateSymbolsCombination();
        const stopPositions = generator.getLastStopPositions();

        expect(stopPositions).toHaveLength(REELS_NUMBER);
        stopPositions.forEach((position, reelId) => {
            expect(conf.getSymbolsSequences()[reelId].getSymbols(position, 3)).toEqual(combination.toMatrix()[reelId]);
        });
    });
});
