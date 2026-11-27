import {
    CustomLinesDefinitions,
    Paytable,
    SymbolsCombination,
    SymbolsSequence,
    VideoSlotConfig,
    VideoSlotSession,
    VideoSlotWinCalculator,
    type SymbolsCombinationDescribing,
    type SymbolsCombinationsGenerating,
    type VideoSlotWinCalculating,
    type WinningLineDescribing,
    type WinningScatterDescribing,
    type WinEvaluationResult,
} from "@fromstan/pokie";

function fixedConfig(): VideoSlotConfig {
    const config = new VideoSlotConfig();
    config.setReelsNumber(3);
    config.setReelsSymbolsNumber(3);
    config.setAvailableSymbols(["A"]);
    config.setWildSymbols([]);
    config.setScatterSymbols([]);
    config.setAvailableBets([1]);
    config.setSymbolsSequences([
        new SymbolsSequence().fromArray(["A", "A", "A"]),
        new SymbolsSequence().fromArray(["A", "A", "A"]),
        new SymbolsSequence().fromArray(["A", "A", "A"]),
    ]);
    const paytable = new Paytable([1], ["A"], [], 3);
    paytable.setPayoutForSymbol("A", 3, 5);
    config.setPaytable(paytable);
    config.setLinesDefinitions(new CustomLinesDefinitions().fromMap({1: [0, 0, 0]}));
    return config;
}

class FixedGenerator implements SymbolsCombinationsGenerating<string> {
    public generateSymbolsCombination(): SymbolsCombinationDescribing<string> {
        return new SymbolsCombination<string>().fromMatrix([
            ["A", "A", "A"],
            ["A", "A", "A"],
            ["A", "A", "A"],
        ]);
    }
}

class DoublingCalculator implements VideoSlotWinCalculating<string> {
    constructor(protected readonly base: VideoSlotWinCalculator<string>) {}

    public calculateWin(bet: number, combination: SymbolsCombinationDescribing<string>): void {
        this.base.calculateWin(bet, combination);
    }
    public getWinAmount(): number {
        return this.base.getWinAmount() * 2;
    }
    public getWinningLines(): Record<string, WinningLineDescribing<string>> {
        return this.base.getWinningLines();
    }
    public getWinningScatters(): Record<string, WinningScatterDescribing<string>> {
        return this.base.getWinningScatters();
    }
    public getLinesWinning(): number {
        return this.base.getLinesWinning() * 2;
    }
    public getScattersWinning(): number {
        return this.base.getScattersWinning() * 2;
    }
}

class DoublingCalculatorWithUnified extends DoublingCalculator {
    public getWinEvaluationResult(): WinEvaluationResult<string> {
        return this.base.getWinEvaluationResult();
    }
}

describe("custom win calculator totals", () => {
    it("settles getWinAmount() when no unified evaluation method is exposed", () => {
        const config = fixedConfig();
        const session = new VideoSlotSession(config, new FixedGenerator(), new DoublingCalculator(new VideoSlotWinCalculator(config)));
        session.setBet(1);
        session.play();
        expect(session.getWinAmount()).toBe(10);
    });

    it("rejects a unified evaluation total that silently disagrees with getWinAmount()", () => {
        const config = fixedConfig();
        const session = new VideoSlotSession(config, new FixedGenerator(), new DoublingCalculatorWithUnified(new VideoSlotWinCalculator(config)));
        session.setBet(1);
        expect(() => session.play()).toThrow(/Win calculator totals disagree/);
    });
});
