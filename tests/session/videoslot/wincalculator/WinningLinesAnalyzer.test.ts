import {
    CustomLinesDefinitions,
    VideoSlotConfig,
    VideoSlotWinCalculator,
    SymbolsCombination,
    WinningLine,
    HorizontalLines,
    WinningLinesAnalyzer,
} from "pokie";

describe("WinningLinesAnalyzer", () => {
    test("allLinesHaveSameSymbolId", () => {
        expect(
            WinningLinesAnalyzer.allLinesHaveSameSymbolId([new WinningLine(1, [], [], "0", [], [], "A")]),
        ).toBeTruthy();

        expect(
            WinningLinesAnalyzer.allLinesHaveSameSymbolId([
                new WinningLine(1, [], [], "0", [], [], "A"),
                new WinningLine(1, [], [], "1", [], [], "A"),
            ]),
        ).toBeTruthy();

        expect(
            WinningLinesAnalyzer.allLinesHaveSameSymbolId([
                new WinningLine(1, [], [], "0", [], [], "A"),
                new WinningLine(1, [], [], "1", [], [], "A"),
                new WinningLine(1, [], [], "2", [], [], "A"),
            ]),
        ).toBeTruthy();

        expect(
            WinningLinesAnalyzer.allLinesHaveSameSymbolId([
                new WinningLine(1, [], [], "0", [], [], "A"),
                new WinningLine(1, [], [], "1", [], [], "K"),
                new WinningLine(1, [], [], "2", [], [], "A"),
            ]),
        ).toBeFalsy();

        expect(
            WinningLinesAnalyzer.allLinesHaveSameSymbolId([
                new WinningLine(1, [], [], "0", [], [], "K"),
                new WinningLine(1, [], [], "1", [], [], "A"),
                new WinningLine(1, [], [], "2", [], [], "A"),
            ]),
        ).toBeFalsy();

        expect(
            WinningLinesAnalyzer.allLinesHaveSameSymbolId([
                new WinningLine(1, [], [], "0", [], [], "K"),
                new WinningLine(1, [], [], "1", [], [], "K"),
                new WinningLine(1, [], [], "2", [], [], "A"),
            ]),
        ).toBeFalsy();

        expect(
            WinningLinesAnalyzer.allLinesHaveSameSymbolId([
                new WinningLine(1, [], [], "0", [], [], "A"),
                new WinningLine(1, [], [], "1", [], [], "K"),
                new WinningLine(1, [], [], "2", [], [], "K"),
            ]),
        ).toBeFalsy();
    });

    test("getLinesWithSymbol", () => {
        const calc = new VideoSlotWinCalculator(new VideoSlotConfig());
        const symbolsCombination = new SymbolsCombination().fromMatrix(
            [
                ["A", "A", "A", "K", "Q"],
                ["K", "K", "K", "Q", "J"],
                ["Q", "Q", "Q", "J", "10"],
            ],
            true,
        );
        calc.calculateWin(1, symbolsCombination);
        const lines = calc.getWinningLines();

        const linesWithTen = WinningLinesAnalyzer.getLinesWithSymbol(
            Object.values(lines),
            symbolsCombination.toMatrix(),
            "10",
        );
        expect(linesWithTen.length).toBe(1);
        expect(linesWithTen.some((line) => line.getLineId() === "2")).toBeTruthy();

        const linesWithQ = WinningLinesAnalyzer.getLinesWithSymbol(
            Object.values(lines),
            symbolsCombination.toMatrix(),
            "Q",
        );
        // noinspection DuplicatedCode
        expect(linesWithQ.length).toBe(3);
        expect(linesWithQ.some((line) => line.getLineId() === "0")).toBeTruthy();
        expect(linesWithQ.some((line) => line.getLineId() === "1")).toBeTruthy();
        expect(linesWithQ.some((line) => line.getLineId() === "2")).toBeTruthy();

        const linesWithK = WinningLinesAnalyzer.getLinesWithSymbol(
            Array.from(Object.values(lines)),
            symbolsCombination.toMatrix(),
            "K",
        );
        expect(linesWithK.length).toBe(2);
        expect(linesWithK.some((line) => line.getLineId() === "0")).toBeTruthy();
        expect(linesWithK.some((line) => line.getLineId() === "1")).toBeTruthy();

        const linesWithA = WinningLinesAnalyzer.getLinesWithSymbol(
            Array.from(Object.values(lines)),
            symbolsCombination.toMatrix(),
            "A",
        );
        expect(linesWithA.length).toBe(1);
        expect(linesWithA.some((line) => line.getLineId() === "1")).toBeTruthy();
    });

    // noinspection DuplicatedCode
    test("getLinesWithWinningSymbol", () => {
        const symbolsCombination = new SymbolsCombination().fromMatrix(
            [
                ["A", "A", "A", "K", "Q"],
                ["K", "K", "K", "Q", "J"],
                ["Q", "Q", "Q", "J", "10"],
            ],
            true,
        );
        const horizontalLines = new HorizontalLines(5, 3);
        const linesDefinitions = new CustomLinesDefinitions();
        linesDefinitions.setLineDefinition("0", horizontalLines.getLineDefinition("0"));
        linesDefinitions.setLineDefinition("1", horizontalLines.getLineDefinition("1"));
        linesDefinitions.setLineDefinition("2", horizontalLines.getLineDefinition("2"));
        linesDefinitions.setLineDefinition("3", [1, 1, 1, 0, 0]);
        const config = new VideoSlotConfig();
        config.setLinesDefinitions(linesDefinitions);
        const calc = new VideoSlotWinCalculator(config);
        calc.calculateWin(1, symbolsCombination);
        const lines = calc.getWinningLines();

        const linesWithTen = WinningLinesAnalyzer.getLinesWithWinningSymbol(Array.from(Object.values(lines)), "10");
        expect(linesWithTen.length).toBe(0);

        const linesWithQ = WinningLinesAnalyzer.getLinesWithWinningSymbol(Array.from(Object.values(lines)), "Q");
        expect(linesWithQ.length).toBe(1);
        expect(linesWithQ.some((line) => line.getLineId() === "2")).toBeTruthy();

        const linesWithK = WinningLinesAnalyzer.getLinesWithWinningSymbol(Array.from(Object.values(lines)), "K");
        expect(linesWithK.length).toBe(2);
        expect(linesWithK.some((line) => line.getLineId() === "0")).toBeTruthy();
        expect(linesWithK.some((line) => line.getLineId() === "3")).toBeTruthy();

        const linesWithA = WinningLinesAnalyzer.getLinesWithWinningSymbol(Array.from(Object.values(lines)), "A");
        expect(linesWithA.length).toBe(1);
        expect(linesWithA.some((line) => line.getLineId() === "1")).toBeTruthy();
    });

    test("getLinesWithDifferentWinningSymbols", () => {
        const calc = new VideoSlotWinCalculator(new VideoSlotConfig());

        let linesWithDifferentSymbols;

        calc.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "A", "A", "K", "Q"],
                    ["K", "K", "K", "Q", "J"],
                    ["Q", "Q", "Q", "J", "10"],
                ],
                true,
            ),
        );
        linesWithDifferentSymbols = WinningLinesAnalyzer.getLinesWithDifferentWinningSymbols(
            Object.values(calc.getWinningLines()),
        );
        // noinspection DuplicatedCode
        expect(linesWithDifferentSymbols.length).toBe(3);
        expect(linesWithDifferentSymbols.some((line) => line.getLineId() === "0")).toBeTruthy();
        expect(linesWithDifferentSymbols.some((line) => line.getLineId() === "1")).toBeTruthy();
        expect(linesWithDifferentSymbols.some((line) => line.getLineId() === "2")).toBeTruthy();

        calc.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "A", "A", "K", "Q"],
                    ["A", "A", "A", "Q", "J"],
                    ["A", "A", "A", "J", "10"],
                ],
                true,
            ),
        );
        linesWithDifferentSymbols = WinningLinesAnalyzer.getLinesWithDifferentWinningSymbols(
            Object.values(calc.getWinningLines()),
        );
        expect(linesWithDifferentSymbols.length).toBe(0);
    });
});
