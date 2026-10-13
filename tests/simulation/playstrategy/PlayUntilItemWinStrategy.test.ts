import {
    SymbolsCombination, VideoSlotSession,
    PaytableRepresenting,
    PlayUntilSymbolWinStrategy,
    SymbolsCombinationDescribing,
    VideoSlotSessionHandling,
    WinningScatter,
    WinningLine,
} from "@fromstan/pokie";

import {overscanConfig, overscanGeometry} from "../../v2/fixtures/OverscanGame.js";

describe("PlayUntilSymbolWinStrategy", () => {
    it.each([0, 2])("uses evaluation-local lines for no-wild search with a wild at generated row %s", wildRow => {
        const config = overscanConfig();
        const screen = Array.from({length: 5}, () => ["B", "B", "A", "B", "B", "B", "B"]);
        screen[0][wildRow] = "W";
        const session = new VideoSlotSession(config, {generateSymbolsCombination: () => new SymbolsCombination().fromMatrix(screen).withCoordinates(overscanGeometry)});
        session.play();
        expect(session.getWinningLines()["0"].getSymbolId()).toBe("A");
        const strategy = new PlayUntilSymbolWinStrategy<string>("A");
        strategy.setAllowWilds(false, "W");
        expect(strategy.canPlayNextSimulationRound(session)).toBe(wildRow === 2);
        // Older/custom sessions without the optional evaluated-screen method use the same adapter.
        const adapter = {
            getSymbolsCombination: () => session.getSymbolsCombination(), getScreenGeometry: () => session.getScreenGeometry(),
            getReelsNumber: () => session.getReelsNumber(), getReelsSymbolsNumber: () => session.getReelsSymbolsNumber(),
            isSymbolScatter: (symbol: string) => session.isSymbolScatter(symbol),
            getWinningLines: () => session.getWinningLines(), getWinningScatters: () => session.getWinningScatters(),
        } as VideoSlotSessionHandling;
        expect(strategy.canPlayNextSimulationRound(adapter)).toBe(wildRow === 2);
    });

    let linesForTest: Record<number, WinningLine>;
    let scattersForTest: Record<string, WinningScatter>;

    // noinspection JSUnusedGlobalSymbols
    const sessionMock = {
        getPaytable(): PaytableRepresenting {
            return {} as PaytableRepresenting;
        },

        getSymbolsCombination(): SymbolsCombinationDescribing {
            return new SymbolsCombination().fromMatrix([
                ["W", "A", "A", "A", "A"],
                ["W", "A", "A", "A", "A"],
                ["W", "A", "A", "A", "A"],
            ]);
        },

        isSymbolScatter(symbolId: string): boolean {
            return symbolId === "S";
        },

        getWinningLines(): Record<number, WinningLine> {
            return linesForTest;
        },

        getWinningScatters(): Record<string, WinningScatter> {
            return scattersForTest;
        },

        getReelsSymbolsSequences(): string[][] {
            return [];
        },

        getReelsSymbolsNumber(): number {
            return 0;
        },

        getReelsNumber(): number {
            return 0;
        },

        getAvailableSymbols(): string[] {
            return [];
        },

        getCreditsAmount(): number {
            return 0;
        },

        setCreditsAmount(): void {
            /* no-op */
        },

        getWinAmount(): number {
            return 0;
        },

        getAvailableBets(): number[] {
            return [];
        },

        isBetAvailable(): boolean {
            return false;
        },

        getBet(): number {
            return 0;
        },

        setBet(): void {
            /* no-op */
        },

        canPlayNextGame(): boolean {
            return false;
        },

        play(): void {
            /* no-op */
        },
    } as unknown as VideoSlotSessionHandling;

    test("canPlayNextGame", () => {
        const createLineWithWinningSymbol = (symbolId: string): WinningLine => {
            return new WinningLine(1, [], [], "1", [], [], symbolId);
        };

        const createLineWithNumberOfWinningSymbols = (symbolId: string, numOfSymbols: number): WinningLine => {
            return new WinningLine(
                1,
                [],
                [],
                "1",
                new Array(numOfSymbols).fill(1).map((one, i) => i + 1),
                [],
                symbolId,
            );
        };

        const createScatterWithNumberOfWinningSymbols = (symbolId: string, numOfSymbols: number): WinningScatter => {
            return new WinningScatter(
                symbolId,
                new Array(numOfSymbols).fill(1).map(() => [0, 0]),
                1,
            );
        };

        const createLineWithWinningSymbolAndWilds = (symbolId: string): WinningLine => {
            return new WinningLine(1, [0, 0, 0], [], "1", [], [1], symbolId);
        };

        const noLines: Record<number, WinningLine> = {};
        const oneWithWinningSymbolA: Record<number, WinningLine> = {
            "1": createLineWithWinningSymbol("A"),
        };
        const oneWithDoubleWinningSymbolA: Record<number, WinningLine> = {
            "1": createLineWithNumberOfWinningSymbols("A", 2),
        };
        const oneWithTripleWinningSymbolA: Record<number, WinningLine> = {
            "1": createLineWithNumberOfWinningSymbols("A", 3),
        };
        const threeWithWinningSymbolA: Record<number, WinningLine> = {
            "1": createLineWithWinningSymbol("A"),
            "2": createLineWithWinningSymbol("A"),
            "3": createLineWithWinningSymbol("A"),
        };
        const withDifferentSymbolsWithoutA: Record<number, WinningLine> = {
            "1": createLineWithWinningSymbol("K"),
            "2": createLineWithWinningSymbol("Q"),
            "3": createLineWithWinningSymbol("J"),
        };
        const withDifferentSymbolsAndOneWithA: Record<number, WinningLine> = {
            "1": createLineWithWinningSymbol("A"),
            "2": createLineWithWinningSymbol("K"),
            "3": createLineWithWinningSymbol("Q"),
        };
        const withDifferentSymbolsAndSeveralWithA: Record<number, WinningLine> = {
            "1": createLineWithWinningSymbol("A"),
            "2": createLineWithWinningSymbol("K"),
            "3": createLineWithWinningSymbol("Q"),
            "4": createLineWithWinningSymbol("A"),
        };
        const oneWithWildsAndA: Record<number, WinningLine> = {
            "1": createLineWithWinningSymbolAndWilds("A"),
        };
        const noScatters: Record<string, WinningScatter> = {};
        const oneScatter: Record<string, WinningScatter> = {
            A: new WinningScatter("A", [], 1),
        };
        const severalScatters: Record<string, WinningScatter> = {
            A: new WinningScatter("A", [], 1),
            K: new WinningScatter("K", [], 1),
        };

        let strategy: PlayUntilSymbolWinStrategy;

        strategy = new PlayUntilSymbolWinStrategy("A");
        linesForTest = noLines;
        scattersForTest = noScatters;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeTruthy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        linesForTest = withDifferentSymbolsWithoutA;
        scattersForTest = noScatters;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeTruthy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        linesForTest = oneWithWinningSymbolA;
        scattersForTest = oneScatter;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeTruthy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        linesForTest = oneWithWinningSymbolA;
        scattersForTest = severalScatters;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeTruthy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        linesForTest = oneWithWinningSymbolA;
        scattersForTest = noScatters;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeFalsy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        linesForTest = threeWithWinningSymbolA;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeFalsy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        linesForTest = withDifferentSymbolsAndOneWithA;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeFalsy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        linesForTest = withDifferentSymbolsAndSeveralWithA;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeFalsy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        strategy.setMinLinesNumber(3);
        linesForTest = oneWithWinningSymbolA;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeTruthy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        strategy.setMinLinesNumber(3);
        linesForTest = threeWithWinningSymbolA;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeFalsy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        strategy.setOnlySameSymbolId(true);
        linesForTest = threeWithWinningSymbolA;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeFalsy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        strategy.setOnlySameSymbolId(true);
        linesForTest = withDifferentSymbolsAndOneWithA;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeTruthy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        strategy.setOnlySameSymbolId(true);
        linesForTest = withDifferentSymbolsAndSeveralWithA;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeTruthy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        strategy.setMinNumberOfWinningSymbols(3);
        linesForTest = oneWithDoubleWinningSymbolA;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeTruthy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        strategy.setMinNumberOfWinningSymbols(3);
        linesForTest = oneWithTripleWinningSymbolA;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeFalsy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        strategy.setExactNumberOfWinningSymbols(3);
        linesForTest = oneWithTripleWinningSymbolA;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeFalsy();

        strategy = new PlayUntilSymbolWinStrategy("A");
        strategy.setAllowWilds(false, "W");
        linesForTest = oneWithWildsAndA;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeTruthy();

        strategy = new PlayUntilSymbolWinStrategy("S");
        linesForTest = {};
        scattersForTest = {S: createScatterWithNumberOfWinningSymbols("S", 3)};
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeFalsy();

        strategy = new PlayUntilSymbolWinStrategy("S");
        strategy.setMinNumberOfWinningSymbols(5);
        scattersForTest = {S: createScatterWithNumberOfWinningSymbols("S", 3)};
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeTruthy();

        strategy = new PlayUntilSymbolWinStrategy("S");
        strategy.setMinNumberOfWinningSymbols(5);
        scattersForTest = {S: createScatterWithNumberOfWinningSymbols("S", 5)};
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeFalsy();

        strategy = new PlayUntilSymbolWinStrategy("S");
        strategy.setExactNumberOfWinningSymbols(5);
        scattersForTest = {S: createScatterWithNumberOfWinningSymbols("S", 5)};
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeFalsy();

        strategy = new PlayUntilSymbolWinStrategy("S");
        strategy.setExactNumberOfWinningSymbols(5);
        scattersForTest = {S: createScatterWithNumberOfWinningSymbols("S", 5)};
        linesForTest = oneWithWildsAndA;
        expect(strategy.canPlayNextSimulationRound(sessionMock)).toBeTruthy();
    });
});
