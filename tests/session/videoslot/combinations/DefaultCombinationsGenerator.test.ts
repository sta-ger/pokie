import {VideoSlotConfig, SymbolsCombinationsGenerator, SymbolsSequence} from "pokie";

describe("DefaultCombinationsGenerator", () => {
    let combinationsGenerator: SymbolsCombinationsGenerator;

    const availableSymbols: string[] = ["A", "K", "Q", "J", "10", "9"];

    const REELS_NUMBER = 5;
    const REELS_SYMBOLS_NUMBER = 3;

    beforeEach(() => {
        const sequences = new Array(5)
            .fill(0)
            .map(() => new SymbolsSequence().fromNumberOfEachSymbol(availableSymbols, 10));
        sequences[2] = new SymbolsSequence().fromArray(sequences[2].toArray().filter((symbol) => symbol !== "A"));
        const conf = new VideoSlotConfig();
        conf.setReelsNumber(REELS_NUMBER);
        conf.setReelsSymbolsNumber(REELS_SYMBOLS_NUMBER);
        conf.setAvailableSymbols(availableSymbols);
        conf.setSymbolsSequences(sequences);
        combinationsGenerator = new SymbolsCombinationsGenerator(conf);
    });

    test("getRandomSymbolsCombination", () => {
        const symbols = combinationsGenerator.generateSymbolsCombination();
        expect(symbols.toMatrix()).toHaveLength(REELS_NUMBER);
        symbols.toMatrix().forEach((reelSymbols, i) => {
            for (let j = 0; j < 1000; j++) {
                expect(reelSymbols).toHaveLength(REELS_SYMBOLS_NUMBER);
                reelSymbols.forEach((symbol) => {
                    expect(availableSymbols.includes(symbol)).toBe(true);
                    if (i === 2) {
                        expect(symbol).not.toBe("A");
                    }
                });
            }
        });
    });
});
