import {SymbolsSequence} from "pokie";

describe("DefaultSymbolsSequence", () => {
    let sequence: SymbolsSequence;

    beforeEach(() => {
        sequence = new SymbolsSequence();
    });

    describe("setSymbol", () => {
        it("should set the symbol at the given index", () => {
            sequence.setSymbol(0, "symbol1");
            expect(sequence.getSymbol(0)).toBe("symbol1");
        });
    });

    describe("setSymbols", () => {
        it("should set the symbols starting from the given index", () => {
            sequence.setSymbols(0, ["symbol1", "symbol2", "symbol3"]);
            expect(sequence.getSymbols(0, 3)).toEqual(["symbol1", "symbol2", "symbol3"]);
        });
    });

    describe("addSymbol", () => {
        it("should add an symbol to the end of the sequence", () => {
            sequence.addSymbol("symbol1");
            expect(sequence.getSize()).toBe(1);
            expect(sequence.getSymbol(0)).toBe("symbol1");
        });

        it("should add multiple symbols at the given index", () => {
            sequence.setSymbols(0, ["symbol1", "symbol2", "symbol3"]);
            sequence.addSymbol("symbol4", 2, 1);
            expect(sequence.toArray()).toEqual(["symbol1", "symbol4", "symbol4", "symbol2", "symbol3"]);
        });
    });

    describe("addSymbols", () => {
        it("should add multiple symbols to the end of the sequence", () => {
            sequence.addSymbols(["symbol1", "symbol2"]);
            expect(sequence.getSize()).toBe(2);
            expect(sequence.getSymbol(0)).toBe("symbol1");
            expect(sequence.getSymbol(1)).toBe("symbol2");
        });

        it("should add multiple symbols at the given index", () => {
            sequence.setSymbols(0, ["symbol1", "symbol2", "symbol3"]);
            sequence.addSymbols(["symbol4", "symbol5"], 1);
            expect(sequence.getSymbols(0, 5)).toEqual(["symbol1", "symbol4", "symbol5", "symbol2", "symbol3"]);
        });
    });

    describe("getSymbol", () => {
        it("should return the symbol at the given index", () => {
            sequence.setSymbols(0, ["symbol1", "symbol2", "symbol3"]);
            expect(sequence.getSymbol(1)).toBe("symbol2");
        });

        it("should wrap the index if it exceeds the sequence length", () => {
            sequence.setSymbols(0, ["symbol1", "symbol2", "symbol3"]);
            expect(sequence.getSymbol(3)).toBe("symbol1");
        });
    });

    describe("getSymbols", () => {
        it("should return the specified number of symbols starting from the given index", () => {
            sequence.setSymbols(0, ["symbol1", "symbol2", "symbol3", "symbol4", "symbol5"]);
            expect(sequence.getSymbols(2, 3)).toEqual(["symbol3", "symbol4", "symbol5"]);
        });

        it("should wrap the index if it exceeds the sequence length", () => {
            sequence.setSymbols(0, ["symbol1", "symbol2", "symbol3"]);
            expect(sequence.getSymbols(2, 2)).toEqual(["symbol3", "symbol1"]);
        });
    });

    describe("getSize", () => {
        it("should return the size of the sequence", () => {
            sequence.setSymbols(0, ["symbol1", "symbol2", "symbol3"]);
            expect(sequence.getSize()).toBe(3);
        });
    });

    describe("getNumberOfSymbols", () => {
        it("should return the number of occurrences of an symbol in the sequence", () => {
            sequence.setSymbols(0, ["symbol1", "symbol2", "symbol1", "symbol3"]);
            expect(sequence.getNumberOfSymbols("symbol1")).toBe(2);
        });
    });

    describe("getSymbolWeight", () => {
        it("should return the weight of an symbol in the sequence", () => {
            sequence.setSymbols(0, ["symbol1", "symbol2", "symbol1", "symbol3"]);
            expect(sequence.getSymbolWeight("symbol1")).toBe(50);
        });
    });

    describe("getSymbolsWeights", () => {
        it("should return the weights of all symbols in the sequence", () => {
            sequence.setSymbols(0, ["symbol1", "symbol2", "symbol1", "symbol3"]);
            expect(sequence.getSymbolsWeights()).toEqual({symbol1: 50, symbol2: 25, symbol3: 25});
        });
    });

    describe("getSymbolsIndexes", () => {
        it("should return the indexes of the specified symbols in the sequence", () => {
            sequence.setSymbols(0, ["symbol1", "symbol2", "symbol1", "symbol3"]);
            expect(sequence.getSymbolsIndexes(["symbol1", "symbol3"])).toEqual([0, 2, 3]);
        });
    });

    describe("getSymbolsStacksIndexes", () => {
        it("should return the indexes and sizes of symbol stacks in the sequence", () => {
            sequence.setSymbols(0, ["symbol1", "symbol1", "symbol2", "symbol3", "symbol3", "symbol3"]);
            expect(sequence.getSymbolsStacksIndexes()).toEqual([
                {index: 0, size: 2},
                {index: 3, size: 3},
            ]);
        });

        it("should not return indexes and sizes for sequences with less than 2 symbols or with only one unique symbol", () => {
            sequence.setSymbols(0, ["symbol1"]);
            expect(sequence.getSymbolsStacksIndexes()).toEqual([]);

            sequence.setSymbols(0, ["symbol1", "symbol1"]);
            expect(sequence.getSymbolsStacksIndexes()).toEqual([]);
        });
    });

    describe("shuffle", () => {
        it("should shuffle the symbols in the sequence", () => {
            sequence.setSymbols(
                0,
                new Array(20).fill(0).map(() => Math.random().toString()),
            );
            const originalSequence = sequence.toArray();
            sequence.shuffle();
            expect(sequence.toArray()).not.toEqual(originalSequence);
        });
    });

    describe("fromArray", () => {
        it("should set the sequence to the given array", () => {
            const symbols = ["symbol1", "symbol2", "symbol3"];
            sequence.fromArray(symbols);
            expect(sequence.toArray()).toEqual(symbols);
        });
    });

    describe("fromSymbolsWeights", () => {
        it("should set the sequence based on symbol weights", () => {
            const symbolsWeights = {symbol1: 50, symbol2: 25, symbol3: 25};
            sequence.fromSymbolsWeights(symbolsWeights, 4);
            expect(sequence.toArray()).toEqual(["symbol1", "symbol1", "symbol2", "symbol3"]);
        });
    });

    describe("fromNumbersOfSymbols", () => {
        it("should set the sequence based on the numbers of symbols", () => {
            const symbolsNumbers = {symbol1: 2, symbol2: 1, symbol3: 3};
            sequence.fromNumbersOfSymbols(symbolsNumbers);
            expect(sequence.toArray()).toEqual(["symbol1", "symbol1", "symbol2", "symbol3", "symbol3", "symbol3"]);
        });
    });

    describe("fromNumberOfEachSymbol", () => {
        it("should set the sequence with the specified number of each symbol", () => {
            const availableSymbols = ["symbol1", "symbol2", "symbol3"];
            const symbolsNumber = 2;
            sequence.fromNumberOfEachSymbol(availableSymbols, symbolsNumber);
            expect(sequence.toArray()).toEqual(["symbol1", "symbol1", "symbol2", "symbol2", "symbol3", "symbol3"]);
        });
    });

    describe("toArray", () => {
        it("should return the sequence as an array", () => {
            sequence.setSymbols(0, ["symbol1", "symbol2", "symbol3"]);
            expect(sequence.toArray()).toEqual(["symbol1", "symbol2", "symbol3"]);
        });
    });

    describe("removeAllSymbols", () => {
        it("should clean the sequence from given symbol", () => {
            sequence.fromArray(["0", "0", "1", "1", "2", "2"]);
            expect(sequence.removeAllSymbols("1").toArray()).not.toContain("1");
        });
    });

    describe("removeSymbol", () => {
        it("should remove a single symbol at provided position", () => {
            sequence.fromArray(["0", "0", "1", "1", "2", "2"]);
            expect(sequence.removeSymbol(1).toArray()).toEqual(["0", "1", "1", "2", "2"]);
        });
    });

    describe("getIndex", () => {
        it("should return wrapped index of symbol on sequence", () => {
            sequence.fromArray(["0", "1", "2", "3", "4", "5"]);
            expect(sequence.getIndex(0)).toBe(0);
            expect(sequence.getIndex(5)).toBe(5);
            expect(sequence.getIndex(6)).toBe(0);
            expect(sequence.getIndex(9)).toBe(3);
            expect(sequence.getIndex(11)).toBe(5);
            expect(sequence.getIndex(12)).toBe(0);
            expect(sequence.getIndex(-1)).toBe(5);
            expect(sequence.getIndex(-4)).toBe(2);
            expect(sequence.getIndex(-6)).toBe(0);
            expect(sequence.getIndex(-8)).toBe(4);
            expect(sequence.getIndex(-12)).toBe(0);
            expect(sequence.getIndex(-15)).toBe(3);
        });
    });
});
