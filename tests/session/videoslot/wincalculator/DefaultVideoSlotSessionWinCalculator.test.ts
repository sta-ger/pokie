import {
    CustomLinesDefinitions,
    LeftToRightLinesPatterns,
    SymbolsCombination,
    SymbolsCombinationsAnalyzer,
    SymbolsSequence,
    VideoSlotConfig,
    VideoSlotWinCalculator,
    WinningLineDescribing,
} from "pokie";

describe("DefaultVideoSlotSessionWinCalculator", () => {
    const config = new VideoSlotConfig();
    const winCalculator = new VideoSlotWinCalculator(config);
    let lines: Record<string, WinningLineDescribing>;

    const testWinning = (bet: number, lines: Record<string, WinningLineDescribing>) => {
        Object.keys(lines).forEach((lineId: string) => {
            const line = lines[lineId];
            const lineWin = config
                .getPaytable()
                .getWinAmountForSymbol(line.getSymbolId(), line.getSymbolsPositions().length, bet);
            expect(line.getWinAmount()).toBe(lineWin);
        });
    };

    const testSymbolsPositions = (line: WinningLineDescribing, expectedSymbolsPositionsLength: number) => {
        expect(line.getSymbolsPositions()).toHaveLength(expectedSymbolsPositionsLength);
    };

    const testWildSymbolsPositions = (line: WinningLineDescribing, expectedSymbolsPositionsLength: number) => {
        expect(line.getWildSymbolsPositions()).toHaveLength(expectedSymbolsPositionsLength);
    };

    test("getSymbolsMatchingPattern", () => {
        expect(
            SymbolsCombinationsAnalyzer.getSymbolsMatchingPattern(["A", "A", "A", "K", "Q"], [1, 1, 1, 0, 0]),
        ).toEqual(["A", "A", "A"]);
        expect(
            SymbolsCombinationsAnalyzer.getSymbolsMatchingPattern(["A", "A", "A", "K", "Q"], [0, 1, 1, 1, 0]),
        ).toEqual(["A", "A", "K"]);
        expect(
            SymbolsCombinationsAnalyzer.getSymbolsMatchingPattern(["A", "A", "A", "K", "Q"], [0, 0, 1, 1, 1]),
        ).toEqual(["A", "K", "Q"]);
        expect(
            SymbolsCombinationsAnalyzer.getSymbolsMatchingPattern(["A", "A", "A", "K", "Q"], [0, 1, 0, 1, 0]),
        ).toEqual(["A", "K"]);
    });

    test("isMatchPattern", () => {
        expect(SymbolsCombinationsAnalyzer.isMatchPattern(["A", "A", "A", "K", "Q"], [1, 1, 0, 0, 0])).toBeTruthy();
        expect(SymbolsCombinationsAnalyzer.isMatchPattern(["A", "A", "A", "K", "Q"], [1, 1, 1, 0, 0])).toBeTruthy();
        expect(SymbolsCombinationsAnalyzer.isMatchPattern(["A", "A", "A", "K", "Q"], [1, 1, 1, 1, 0])).toBeFalsy();
        expect(SymbolsCombinationsAnalyzer.isMatchPattern(["A", "A", "A", "K", "Q"], [1, 1, 1, 1, 1])).toBeFalsy();
        expect(SymbolsCombinationsAnalyzer.isMatchPattern(["A", "A", "A", "K", "Q"], [1, 0, 1, 0, 0])).toBeTruthy();
        expect(SymbolsCombinationsAnalyzer.isMatchPattern(["A", "A", "A", "K", "Q"], [1, 0, 1, 0, 1])).toBeFalsy();

        expect(
            SymbolsCombinationsAnalyzer.isMatchPattern(["A", "W", "K", "Q", "J"], [1, 1, 0, 0, 0], ["W"]),
        ).toBeTruthy();
        expect(
            SymbolsCombinationsAnalyzer.isMatchPattern(["A", "W", "W1", "Q", "J"], [1, 1, 0, 0, 0], ["W", "W1"]),
        ).toBeTruthy();
        expect(
            SymbolsCombinationsAnalyzer.isMatchPattern(["W", "A", "K", "Q", "J"], [1, 1, 0, 0, 0], ["W"]),
        ).toBeTruthy();
        expect(
            SymbolsCombinationsAnalyzer.isMatchPattern(["A", "W", "W", "Q", "J"], [1, 1, 1, 0, 0], ["W"]),
        ).toBeTruthy();
        expect(
            SymbolsCombinationsAnalyzer.isMatchPattern(["A", "W", "W", "W", "J"], [1, 1, 1, 1, 0], ["W"]),
        ).toBeTruthy();
        expect(
            SymbolsCombinationsAnalyzer.isMatchPattern(["A", "W", "W", "W", "W"], [1, 1, 1, 1, 1], ["W"]),
        ).toBeTruthy();
        expect(
            SymbolsCombinationsAnalyzer.isMatchPattern(["W", "W", "K", "Q", "J"], [1, 1, 1, 0, 0], ["W"]),
        ).toBeTruthy();
        expect(
            SymbolsCombinationsAnalyzer.isMatchPattern(["W", "W", "W", "K", "Q"], [1, 1, 1, 1, 0], ["W"]),
        ).toBeTruthy();
        expect(
            SymbolsCombinationsAnalyzer.isMatchPattern(["W", "W", "W", "W", "K"], [1, 1, 1, 1, 1], ["W"]),
        ).toBeTruthy();
        expect(
            SymbolsCombinationsAnalyzer.isMatchPattern(["W", "W", "K", "W", "K"], [1, 1, 1, 1, 1], ["W"]),
        ).toBeTruthy();
        expect(
            SymbolsCombinationsAnalyzer.isMatchPattern(["K", "W", "K", "W", "K"], [1, 1, 1, 1, 1], ["W"]),
        ).toBeTruthy();
        expect(
            SymbolsCombinationsAnalyzer.isMatchPattern(["K", "W", "A", "W", "K"], [1, 1, 1, 1, 1], ["W"]),
        ).toBeFalsy();
    });

    test("getWinningSymbolId", () => {
        expect(SymbolsCombinationsAnalyzer.getWinningSymbolId(["A", "A", "A", "K", "Q"], [1, 1, 1, 0, 0])).toBe("A");
        expect(SymbolsCombinationsAnalyzer.getWinningSymbolId(["A", "W", "A", "K", "Q"], [1, 1, 1, 0, 0], ["W"])).toBe(
            "A",
        );
        expect(SymbolsCombinationsAnalyzer.getWinningSymbolId(["A", "W", "W", "K", "Q"], [1, 1, 1, 0, 0], ["W"])).toBe(
            "A",
        );
        expect(SymbolsCombinationsAnalyzer.getWinningSymbolId(["W", "W", "A", "K", "Q"], [1, 1, 1, 0, 0], ["W"])).toBe(
            "A",
        );
        expect(SymbolsCombinationsAnalyzer.getWinningSymbolId(["W", "A", "A", "K", "Q"], [1, 1, 1, 0, 0], ["W"])).toBe(
            "A",
        );
        expect(SymbolsCombinationsAnalyzer.getWinningSymbolId(["W", "A", "W", "K", "Q"], [1, 1, 1, 0, 0], ["W"])).toBe(
            "A",
        );
    });

    test("getMatchingPattern", () => {
        const patterns = new LeftToRightLinesPatterns(5).toArray();
        expect(SymbolsCombinationsAnalyzer.getMatchingPattern(["A", "A", "K", "Q", "J"], patterns)).toEqual([
            1, 1, 0, 0, 0,
        ]);
        expect(SymbolsCombinationsAnalyzer.getMatchingPattern(["A", "A", "A", "K", "Q"], patterns)).toEqual([
            1, 1, 1, 0, 0,
        ]);
        expect(SymbolsCombinationsAnalyzer.getMatchingPattern(["A", "A", "A", "A", "Q"], patterns)).toEqual([
            1, 1, 1, 1, 0,
        ]);
        expect(SymbolsCombinationsAnalyzer.getMatchingPattern(["A", "A", "A", "A", "A"], patterns)).toEqual([
            1, 1, 1, 1, 1,
        ]);
        expect(SymbolsCombinationsAnalyzer.getMatchingPattern(["A", "W", "A", "W", "A"], patterns, ["W"])).toEqual([
            1, 1, 1, 1, 1,
        ]);
        expect(SymbolsCombinationsAnalyzer.getMatchingPattern(["W", "W", "A", "W", "K"], patterns, ["W"])).toEqual([
            1, 1, 1, 1, 0,
        ]);
        expect(SymbolsCombinationsAnalyzer.getMatchingPattern(["A", "W", "A", "W", "K"], patterns, ["W"])).toEqual([
            1, 1, 1, 1, 0,
        ]);
    });

    test("getWildSymbolsPositions", () => {
        expect(
            SymbolsCombinationsAnalyzer.getWildSymbolsPositions(["A", "W", "K", "Q", "J"], [1, 1, 0, 0, 0], ["W"]),
        ).toEqual([1]);
        expect(
            SymbolsCombinationsAnalyzer.getWildSymbolsPositions(["W", "A", "K", "Q", "J"], [1, 1, 0, 0, 0], ["W"]),
        ).toEqual([0]);
        expect(
            SymbolsCombinationsAnalyzer.getWildSymbolsPositions(["A", "W", "W", "Q", "J"], [1, 1, 1, 0, 0], ["W"]),
        ).toEqual([1, 2]);
        expect(
            SymbolsCombinationsAnalyzer.getWildSymbolsPositions(["A", "W", "W", "W", "J"], [1, 1, 1, 1, 0], ["W"]),
        ).toEqual([1, 2, 3]);
        expect(
            SymbolsCombinationsAnalyzer.getWildSymbolsPositions(["A", "W", "W", "W", "W"], [1, 1, 1, 1, 1], ["W"]),
        ).toEqual([1, 2, 3, 4]);
        expect(
            SymbolsCombinationsAnalyzer.getWildSymbolsPositions(["W", "W", "K", "Q", "J"], [1, 1, 1, 0, 0], ["W"]),
        ).toEqual([0, 1]);
        expect(
            SymbolsCombinationsAnalyzer.getWildSymbolsPositions(["W", "W", "W", "K", "Q"], [1, 1, 1, 1, 0], ["W"]),
        ).toEqual([0, 1, 2]);
        expect(
            SymbolsCombinationsAnalyzer.getWildSymbolsPositions(["W", "W", "W", "W", "K"], [1, 1, 1, 1, 1], ["W"]),
        ).toEqual([0, 1, 2, 3]);
        expect(
            SymbolsCombinationsAnalyzer.getWildSymbolsPositions(["W", "W", "K", "W", "K"], [1, 1, 1, 1, 1], ["W"]),
        ).toEqual([0, 1, 3]);
        expect(
            SymbolsCombinationsAnalyzer.getWildSymbolsPositions(["K", "W", "K", "W", "K"], [1, 1, 1, 1, 1], ["W"]),
        ).toEqual([1, 3]);
    });

    test("getScatterSymbolsPositions", () => {
        expect(
            SymbolsCombinationsAnalyzer.getScatterSymbolsPositions(
                new SymbolsCombination()
                    .fromMatrix(
                        [
                            ["A", "K", "Q", "J", "10"],
                            ["S", "S", "Q", "J", "S"],
                            ["A", "K", "S", "J", "10"],
                        ],
                        true,
                    )
                    .toMatrix(),
                "S",
            ),
        ).toEqual([
            [0, 1],
            [1, 1],
            [2, 2],
            [4, 1],
        ]);
    });

    test("getSymbolsClusters", () => {
        // Reel-major matrix (combination[reelId][rowIndex]) shaped like a plus sign of "A"s in
        // the middle, plus one isolated "A" pair (below minimum size) and one non-"A" symbol.
        const symbols = new SymbolsCombination()
            .fromMatrix(
                [
                    ["K", "A", "K"],
                    ["A", "A", "A"],
                    ["K", "A", "K"],
                ],
                true,
            )
            .toMatrix();

        const clusters = SymbolsCombinationsAnalyzer.getSymbolsClusters(symbols, 5);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].symbolId).toBe("A");
        expect(clusters[0].positions).toHaveLength(5);

        // raising the minimum above the cluster's size drops it
        expect(SymbolsCombinationsAnalyzer.getSymbolsClusters(symbols, 6)).toHaveLength(0);

        // diagonal neighbors don't connect a cluster
        const diagonalOnly = new SymbolsCombination()
            .fromMatrix(
                [
                    ["A", "K"],
                    ["K", "A"],
                ],
                true,
            )
            .toMatrix();
        expect(SymbolsCombinationsAnalyzer.getSymbolsClusters(diagonalOnly, 2)).toHaveLength(0);

        // a wild joins an adjacent cluster instead of starting/ending it on its own
        const withWild = new SymbolsCombination()
            .fromMatrix(
                [
                    ["A", "A"],
                    ["A", "W"],
                ],
                true,
            )
            .toMatrix();
        const clustersWithWild = SymbolsCombinationsAnalyzer.getSymbolsClusters(withWild, 4, ["W"]);
        expect(clustersWithWild).toHaveLength(1);
        expect(clustersWithWild[0].symbolId).toBe("A");
        expect(clustersWithWild[0].positions).toHaveLength(4);

        // a wild with no adjacent real symbol at all never seeds a cluster of its own
        const isolatedWild = new SymbolsCombination().fromMatrix([["W"]]).toMatrix();
        expect(SymbolsCombinationsAnalyzer.getSymbolsClusters(isolatedWild, 1, ["W"])).toHaveLength(0);

        // wildSubstitutions restricts which target symbols a wild may join
        const restrictedWild = new SymbolsCombination()
            .fromMatrix(
                [
                    ["A", "A"],
                    ["A", "W"],
                ],
                true,
            )
            .toMatrix();
        expect(
            SymbolsCombinationsAnalyzer.getSymbolsClusters(restrictedWild, 4, ["W"], {W: ["K"]}),
        ).toHaveLength(0);
        expect(
            SymbolsCombinationsAnalyzer.getSymbolsClusters(restrictedWild, 4, ["W"], {W: ["A"]}),
        ).toHaveLength(1);
    });

    test("getSymbolsCount", () => {
        const symbols = new SymbolsCombination()
            .fromMatrix(
                [
                    ["A", "K", "Q", "J", "10"],
                    ["A", "A", "Q", "J", "S"],
                    ["A", "K", "S", "J", "10"],
                ],
                true,
            )
            .toMatrix();

        expect(SymbolsCombinationsAnalyzer.getSymbolsCount(symbols, "A")).toBe(4);
        expect(SymbolsCombinationsAnalyzer.getSymbolsCount(symbols, "J")).toBe(3);
        expect(SymbolsCombinationsAnalyzer.getSymbolsCount(symbols, "9")).toBe(0);
    });

    test("getSymbolsFrequency", () => {
        const symbols = new SymbolsCombination()
            .fromMatrix(
                [
                    ["A", "K", "Q", "J", "10"],
                    ["A", "A", "Q", "J", "S"],
                    ["A", "K", "S", "J", "10"],
                ],
                true,
            )
            .toMatrix();

        expect(SymbolsCombinationsAnalyzer.getSymbolsFrequency(symbols)).toEqual({
            A: 4,
            K: 2,
            Q: 2,
            J: 3,
            "10": 2,
            S: 2,
        });
    });

    test("getSymbolsForDefinitionTest", () => {
        expect(
            SymbolsCombinationsAnalyzer.getSymbolsForDefinition(
                new SymbolsCombination()
                    .fromMatrix(
                        [
                            ["A", "A", "A", "K", "Q"],
                            ["A", "K", "Q", "J", "10"],
                            ["K", "Q", "J", "10", "9"],
                        ],
                        true,
                    )
                    .toMatrix(),
                [0, 0, 0, 0, 0],
            ),
        ).toEqual(["A", "A", "A", "K", "Q"]);

        expect(
            SymbolsCombinationsAnalyzer.getSymbolsForDefinition(
                new SymbolsCombination()
                    .fromMatrix(
                        [
                            ["A", "A", "A", "K", "Q"],
                            ["A", "K", "Q", "J", "10"],
                            ["K", "Q", "J", "10", "9"],
                        ],
                        true,
                    )
                    .toMatrix(),
                [1, 1, 1, 1, 1],
            ),
        ).toEqual(["A", "K", "Q", "J", "10"]);

        expect(
            SymbolsCombinationsAnalyzer.getSymbolsForDefinition(
                new SymbolsCombination()
                    .fromMatrix(
                        [
                            ["A", "A", "A", "K", "Q"],
                            ["A", "K", "Q", "J", "10"],
                            ["K", "Q", "J", "10", "9"],
                        ],
                        true,
                    )
                    .toMatrix(),
                [2, 2, 2, 2, 2],
            ),
        ).toEqual(["K", "Q", "J", "10", "9"]);

        expect(
            SymbolsCombinationsAnalyzer.getSymbolsForDefinition(
                new SymbolsCombination()
                    .fromMatrix(
                        [
                            ["A", "A", "A", "K", "Q"],
                            ["A", "K", "Q", "J", "10"],
                            ["K", "Q", "J", "10", "9"],
                        ],
                        true,
                    )
                    .toMatrix(),
                [0, 1, 2, 1, 0],
            ),
        ).toEqual(["A", "K", "J", "J", "Q"]);

        expect(
            SymbolsCombinationsAnalyzer.getSymbolsForDefinition(
                new SymbolsCombination()
                    .fromMatrix(
                        [
                            ["A", "A", "A", "K", "Q"],
                            ["A", "K", "Q", "J", "10"],
                            ["K", "Q", "J", "10", "9"],
                        ],
                        true,
                    )
                    .toMatrix(),
                [2, 0, 1, 2, 0],
            ),
        ).toEqual(["K", "A", "Q", "10", "Q"]);
    });

    test("getWinningLinesIdsTest", () => {
        const definitions = new CustomLinesDefinitions().fromMap({
            0: [1, 1, 1],
            1: [0, 0, 0],
            2: [2, 2, 2],
            3: [0, 1, 2],
            4: [2, 1, 0],
        });

        const patterns = new LeftToRightLinesPatterns(3).toArray();

        expect(
            SymbolsCombinationsAnalyzer.getWinningLinesIds(
                new SymbolsCombination()
                    .fromMatrix(
                        [
                            ["A", "A", "A"],
                            ["K", "Q", "J"],
                            ["K", "Q", "J"],
                        ],
                        true,
                    )
                    .toMatrix(),
                definitions,
                patterns,
            ),
        ).toEqual(["1"]);

        expect(
            SymbolsCombinationsAnalyzer.getWinningLinesIds(
                new SymbolsCombination()
                    .fromMatrix(
                        [
                            ["A", "A", "A"],
                            ["K", "Q", "J"],
                            ["A", "A", "A"],
                        ],
                        true,
                    )
                    .toMatrix(),
                definitions,
                patterns,
            ),
        ).toEqual(["1", "2"]);

        expect(
            SymbolsCombinationsAnalyzer.getWinningLinesIds(
                new SymbolsCombination()
                    .fromMatrix(
                        [
                            ["K", "Q", "J"],
                            ["A", "A", "A"],
                            ["K", "Q", "J"],
                        ],
                        true,
                    )
                    .toMatrix(),
                definitions,
                patterns,
            ),
        ).toEqual(["0"]);

        expect(
            SymbolsCombinationsAnalyzer.getWinningLinesIds(
                new SymbolsCombination()
                    .fromMatrix(
                        [
                            ["A", "A", "A"],
                            ["A", "A", "A"],
                            ["K", "Q", "J"],
                        ],
                        true,
                    )
                    .toMatrix(),
                definitions,
                patterns,
            ),
        ).toEqual(["0", "1", "3"]);

        expect(
            SymbolsCombinationsAnalyzer.getWinningLinesIds(
                new SymbolsCombination()
                    .fromMatrix(
                        [
                            ["K", "Q", "J"],
                            ["A", "A", "A"],
                            ["A", "A", "A"],
                        ],
                        true,
                    )
                    .toMatrix(),
                definitions,
                patterns,
            ),
        ).toEqual(["0", "2", "4"]);

        expect(
            SymbolsCombinationsAnalyzer.getWinningLinesIds(
                new SymbolsCombination()
                    .fromMatrix([
                        ["A", "A", "A"],
                        ["A", "A", "A"],
                        ["A", "A", "A"],
                    ])
                    .toMatrix(),
                definitions,
                patterns,
            ),
        ).toEqual(["0", "1", "2", "3", "4"]);
    });

    test("setGameStateTest", () => {
        expect(() =>
            winCalculator.calculateWin(
                1,
                new SymbolsCombination().fromMatrix(
                    [
                        ["A", "A", "A", "A", "A"],
                        ["A", "A", "A", "A", "A"],
                        ["A", "A", "A", "A", "A"],
                    ],
                    true,
                ),
            ),
        ).not.toThrow();

        expect(() =>
            winCalculator.calculateWin(
                0,
                new SymbolsCombination().fromMatrix(
                    [
                        ["A", "A", "A", "A", "A"],
                        ["A", "A", "A", "A", "A"],
                        ["A", "A", "A", "A", "A"],
                    ],
                    true,
                ),
            ),
        ).toThrow();
    });

    test("calculateWinningLinesAfterUpdateStateTest", () => {
        config.getAvailableBets().forEach((bet) => {
            config.getAvailableSymbols().forEach((symbol) => {
                if (!config.isSymbolWild(symbol) && !config.isSymbolScatter(symbol)) {
                    try {
                        winCalculator.calculateWin(
                            bet,
                            new SymbolsCombination().fromMatrix(
                                [
                                    [symbol, symbol, symbol, symbol, symbol],
                                    [symbol, symbol, symbol, symbol, symbol],
                                    [symbol, symbol, symbol, symbol, symbol],
                                ],
                                true,
                            ),
                        );
                    } catch (e) {
                        console.error(e);
                    }
                    lines = winCalculator.getWinningLines();
                    expect(Object.keys(lines)).toHaveLength(3);
                    expect(Object.keys(lines)).toContain("0");
                    expect(Object.keys(lines)).toContain("1");
                    expect(Object.keys(lines)).toContain("2");
                    testWinning(bet, lines);
                    testSymbolsPositions(lines["0"], 5);
                    testSymbolsPositions(lines["1"], 5);
                    testSymbolsPositions(lines["2"], 5);
                }
            });
        });

        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "A", "A", "K", "Q"],
                    ["A", "K", "Q", "J", "10"],
                    ["K", "Q", "J", "10", "9"],
                ],
                true,
            ),
        );
        lines = winCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines)).toContain("1");
        expect(Object.keys(lines)).not.toContain("0");
        expect(Object.keys(lines)).not.toContain("2");
        testWinning(1, lines);
        testSymbolsPositions(lines["1"], 3);
    });

    test("doNotCreateLineOfScatterSymbolsTest", () => {
        const conf = new VideoSlotConfig();
        conf.setScatterSymbols(["A"]);

        const calc = new VideoSlotWinCalculator(conf);

        calc.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "A", "A", "K", "Q"],
                    ["A", "K", "Q", "J", "10"],
                    ["K", "Q", "J", "10", "9"],
                ],
                true,
            ),
        );
        expect(Object.keys(calc.getWinningLines())).toHaveLength(0);
    });

    test("calculateWinningLinesWithWildsAfterUpdateStateTest", () => {
        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "W", "A", "K", "Q"],
                    ["A", "K", "Q", "J", "10"],
                    ["K", "Q", "J", "10", "9"],
                ],
                true,
            ),
        );
        // noinspection DuplicatedCode
        lines = winCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines).includes("1")).toBe(true);
        expect(Object.keys(lines).includes("0")).toBe(false);
        expect(Object.keys(lines).includes("2")).toBe(false);
        testWinning(1, lines);
        testWildSymbolsPositions(lines[1], 1);
        testSymbolsPositions(lines[1], 3);

        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "W", "W", "K", "Q"],
                    ["A", "K", "Q", "J", "10"],
                    ["K", "Q", "J", "10", "9"],
                ],
                true,
            ),
        );
        // noinspection DuplicatedCode
        lines = winCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines).includes("1")).toBe(true);
        expect(Object.keys(lines).includes("0")).toBe(false);
        expect(Object.keys(lines).includes("2")).toBe(false);
        testWinning(1, lines);
        testWildSymbolsPositions(lines[1], 2);
        testSymbolsPositions(lines[1], 3);

        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "W", "W", "W", "Q"],
                    ["A", "K", "Q", "J", "10"],
                    ["K", "Q", "J", "10", "9"],
                ],
                true,
            ),
        );
        // noinspection DuplicatedCode
        lines = winCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines).includes("1")).toBe(true);
        expect(Object.keys(lines).includes("0")).toBe(false);
        expect(Object.keys(lines).includes("2")).toBe(false);
        testWinning(1, lines);
        testWildSymbolsPositions(lines[1], 3);
        testSymbolsPositions(lines[1], 4);

        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "W", "W", "W", "W"],
                    ["A", "K", "Q", "J", "10"],
                    ["K", "Q", "J", "10", "9"],
                ],
                true,
            ),
        );
        // noinspection DuplicatedCode
        lines = winCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines).includes("1")).toBe(true);
        expect(Object.keys(lines).includes("0")).toBe(false);
        expect(Object.keys(lines).includes("2")).toBe(false);
        testWinning(1, lines);
        testWildSymbolsPositions(lines[1], 4);
        testSymbolsPositions(lines[1], 5);

        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["W", "W", "W", "W", "A"],
                    ["A", "K", "Q", "J", "10"],
                    ["K", "Q", "J", "10", "9"],
                ],
                true,
            ),
        );
        // noinspection DuplicatedCode
        lines = winCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines).includes("1")).toBe(true);
        expect(Object.keys(lines).includes("0")).toBe(false);
        expect(Object.keys(lines).includes("2")).toBe(false);
        testWinning(1, lines);
        testWildSymbolsPositions(lines[1], 4);
        testSymbolsPositions(lines[1], 5);

        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["W", "W", "A", "W", "W"],
                    ["A", "K", "Q", "J", "10"],
                    ["K", "Q", "J", "10", "9"],
                ],
                true,
            ),
        );
        // noinspection DuplicatedCode
        lines = winCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(1);
        expect(Object.keys(lines).includes("1")).toBe(true);
        expect(Object.keys(lines).includes("0")).toBe(false);
        expect(Object.keys(lines).includes("2")).toBe(false);
        testWinning(1, lines);
        testWildSymbolsPositions(lines[1], 4);
        testSymbolsPositions(lines[1], 5);

        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["W", "W", "W", "W", "W"],
                    ["A", "K", "Q", "J", "10"],
                    ["K", "Q", "J", "10", "9"],
                ],
                true,
            ),
        );
        lines = winCalculator.getWinningLines();
        expect(Object.keys(lines)).toHaveLength(0);
    });

    test("calculateWinningScattersAfterUpdateStateTest", () => {
        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "S", "A", "K", "Q"],
                    ["A", "K", "Q", "J", "10"],
                    ["K", "Q", "J", "10", "9"],
                ],
                true,
            ),
        );
        let scatters = winCalculator.getWinningScatters();
        expect(Object.keys(scatters)).toHaveLength(0);

        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "S", "A", "K", "Q"],
                    ["A", "K", "S", "J", "10"],
                    ["K", "Q", "J", "10", "9"],
                ],
                true,
            ),
        );
        scatters = winCalculator.getWinningScatters();
        expect(Object.keys(scatters)).toHaveLength(0);

        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "S", "A", "K", "Q"],
                    ["A", "K", "S", "J", "10"],
                    ["K", "Q", "J", "10", "S"],
                ],
                true,
            ),
        );
        scatters = winCalculator.getWinningScatters();
        expect(Object.keys(scatters)).toHaveLength(1);
        expect(scatters["S"].getWinAmount()).toBe(
            config
                .getPaytable()
                .getWinAmountForSymbol(scatters["S"].getSymbolId(), scatters["S"].getSymbolsPositions().length, 1),
        );
    });

    test("calculateAllLinesWinAmountAfterUpdateStateTest", () => {
        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "A", "A", "A", "A"],
                    ["A", "A", "A", "K", "Q"],
                    ["A", "A", "K", "Q", "J"],
                ],
                true,
            ),
        );
        expect(winCalculator.getLinesWinning()).toBeGreaterThan(0);
    });

    test("calculateAllScattersWinAmountAfterUpdateStateTest", () => {
        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "A", "A", "A", "A"],
                    ["A", "A", "A", "S", "S"],
                    ["A", "A", "K", "Q", "S"],
                ],
                true,
            ),
        );
        expect(winCalculator.getScattersWinning()).toBeGreaterThan(0);
    });

    test("calculateTotalWinAmountAfterUpdateStateTest", () => {
        winCalculator.calculateWin(
            1,
            new SymbolsCombination().fromMatrix(
                [
                    ["A", "A", "A", "A", "A"],
                    ["A", "A", "A", "S", "S"],
                    ["A", "A", "K", "Q", "S"],
                ],
                true,
            ),
        );
        expect(winCalculator.getWinAmount()).toBeGreaterThan(0);
    });

    test("getAllPossibleSymbolsCombinations", () => {
        const reel1 = new SymbolsSequence().fromArray(["A", "K", "Q"]);
        const reel2 = new SymbolsSequence().fromArray(["A", "K"]);

        const combinations = SymbolsCombinationsAnalyzer.getAllPossibleSymbolsCombinations([reel1, reel2], 2);

        // total number of combinations is the product of every reel's size
        expect(combinations).toHaveLength(reel1.getSize() * reel2.getSize());

        // every combination reads `symbolsNumber` consecutive (wrapping) symbols from each reel,
        // starting at every possible stop position on that reel
        const expected: string[][][] = [];
        for (let reel1Stop = 0; reel1Stop < reel1.getSize(); reel1Stop++) {
            for (let reel2Stop = 0; reel2Stop < reel2.getSize(); reel2Stop++) {
                expected.push([reel1.getSymbols(reel1Stop, 2), reel2.getSymbols(reel2Stop, 2)]);
            }
        }
        expect(combinations).toEqual(expect.arrayContaining(expected));
        expect(expected).toEqual(expect.arrayContaining(combinations));
    });

    test("getCombinationProbability", () => {
        const reel1 = new SymbolsSequence().fromArray(["A", "K", "Q", "J"]); // size 4
        const reel2 = new SymbolsSequence().fromArray(["A", "K"]); // size 2

        expect(SymbolsCombinationsAnalyzer.getCombinationProbability([reel1, reel2])).toBeCloseTo(1 / 8);
    });

    test("getUniqueCombinationsWithWeights", () => {
        const combinationA = [
            ["A", "K"],
            ["Q", "J"],
        ];
        const combinationB = [
            ["A", "K"],
            ["Q", "J"],
        ]; // same content as combinationA, different array instance
        const combinationC = [
            ["9", "10"],
            ["Q", "J"],
        ];

        const unique = SymbolsCombinationsAnalyzer.getUniqueCombinationsWithWeights([
            combinationA,
            combinationB,
            combinationC,
        ]);

        expect(unique).toHaveLength(2);
        expect(unique.find((entry) => entry.combination === combinationA)?.weight).toBe(2);
        expect(unique.find((entry) => entry.combination === combinationC)?.weight).toBe(1);
    });

    test("areCombinationsEqual", () => {
        const combinationA = [
            ["A", "K"],
            ["Q", "J"],
        ];
        const combinationB = [
            ["A", "K"],
            ["Q", "J"],
        ];
        const combinationC = [
            ["A", "K"],
            ["Q", "10"],
        ];

        expect(SymbolsCombinationsAnalyzer.areCombinationsEqual(combinationA, combinationB)).toBe(true);
        expect(SymbolsCombinationsAnalyzer.areCombinationsEqual(combinationA, combinationC)).toBe(false);
    });
});
