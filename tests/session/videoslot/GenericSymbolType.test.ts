import {
    LinesDefinitionsFor3x3,
    Paytable,
    ScatteredLinesPatterns,
    SymbolsSequence,
    VideoSlotConfig,
    VideoSlotSession,
} from "pokie";

describe("GenericSymbolType", () => {
    test("VideoSlotSession works end-to-end with numeric symbol IDs, not just string", () => {
        const config = new VideoSlotConfig<number>();
        config.setReelsNumber(3);
        config.setReelsSymbolsNumber(3);
        config.setAvailableSymbols([1, 2, 3, 4, 100, 200]); // 100 = wild, 200 = scatter
        config.setWildSymbols([100]);
        config.setScatterSymbols([200]);
        config.setLinesDefinitions(new LinesDefinitionsFor3x3());
        config.setLinesPatterns(new ScatteredLinesPatterns(3));
        const paytable = new Paytable<number>(config.getAvailableBets(), [1, 2, 3, 4], [100], 3);
        paytable.setPayoutForSymbol(1, 3, 10);
        config.setPaytable(paytable);
        // build reel strips explicitly so wins are deterministic-ish and typed as number[]
        const sequences = new Array(3)
            .fill(0)
            .map(() => new SymbolsSequence<number>().fromNumberOfEachSymbol([1, 2, 3, 4, 100, 200], 5));
        config.setSymbolsSequences(sequences);

        const session = new VideoSlotSession<number>(config);
        session.setBet(config.getAvailableBets()[0]);
        session.play();

        const combination = session.getSymbolsCombination().toMatrix();
        expect(combination).toHaveLength(3);
        combination.forEach((reelSymbols) => {
            reelSymbols.forEach((symbol) => {
                expect(typeof symbol).toBe("number");
                expect(config.getAvailableSymbols()).toContain(symbol);
            });
        });

        expect(session.getAvailableSymbols()).toEqual([1, 2, 3, 4, 100, 200]);
        expect(session.getWildSymbols()).toEqual([100]);
        expect(session.getScatterSymbols()).toEqual([200]);
        expect(session.isSymbolWild(100)).toBe(true);
        expect(session.isSymbolScatter(200)).toBe(true);
        expect(typeof session.getWinAmount()).toBe("number");

        Object.values(session.getWinningLines()).forEach((line) => {
            expect(typeof line.getSymbolId()).toBe("number");
        });
        Object.values(session.getWinningScatters()).forEach((scatter) => {
            expect(typeof scatter.getSymbolId()).toBe("number");
        });
    });
});
