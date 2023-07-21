import {SymbolsCombination} from "pokie";

describe("DefaultSymbolsCombination", () => {
    let symbolsCombination: SymbolsCombination;

    beforeEach(() => {
        symbolsCombination = new SymbolsCombination();
    });

    describe("getSymbols", () => {
        it("should return symbols for a given reelId", () => {
            symbolsCombination.fromMatrix([
                ["A", "B", "C"],
                ["X", "Y", "Z"],
            ]);

            expect(symbolsCombination.getSymbols(0)).toEqual(["A", "B", "C"]);
            expect(symbolsCombination.getSymbols(1)).toEqual(["X", "Y", "Z"]);
        });
    });

    describe("fromMatrix", () => {
        it("should set the combination from a given array", () => {
            const input = [
                ["A", "B", "C"],
                ["X", "Y", "Z"],
            ];

            const inputTransposed = [
                ["A", "X"],
                ["B", "Y"],
                ["C", "Z"],
            ];

            symbolsCombination.fromMatrix(input);
            expect(symbolsCombination.toMatrix()).toEqual(input);
            expect(symbolsCombination.toMatrix(true)).toEqual(inputTransposed);

            symbolsCombination.fromMatrix(input, true);
            expect(symbolsCombination.toMatrix()).toEqual(inputTransposed);
        });

        it("should return the instance of the class", () => {
            const result = symbolsCombination.fromMatrix([]);

            expect(result).toBe(symbolsCombination);
        });
    });

    describe("toMatrix", () => {
        it("should return the current combination as an array", () => {
            const input = [
                ["A", "B", "C"],
                ["X", "Y", "Z"],
            ];

            symbolsCombination.fromMatrix(input);

            expect(symbolsCombination.toMatrix()).toEqual(input);
        });
    });
});
