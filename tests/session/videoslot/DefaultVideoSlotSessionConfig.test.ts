import {VideoSlotConfig, Paytable, PaytableRepresenting} from "pokie";

describe("DefaultVideoSlotSessionConfig", () => {
    let config: VideoSlotConfig;

    beforeEach(() => {
        config = new VideoSlotConfig();
    });

    const testPaytableSymbol = (
        paytable: PaytableRepresenting,
        symbolId: string,
        num: number,
        bet: number,
        expected: number,
    ) => {
        expect(paytable.getWinAmountForSymbol(symbolId, num, bet)).toEqual(expected);
    };

    it("should create default config", () => {
        expect(config.getWildSymbols()).toEqual(["W"]);

        expect(config.getScatterSymbols().length).toEqual(1);
        expect(config.getScatterSymbols()[0]).toEqual("S");

        expect(config.getReelsNumber()).toEqual(5);
        expect(config.getReelsSymbolsNumber()).toEqual(3);

        expect(config.getLinesDefinitions().getLineDefinition("0")).toEqual([1, 1, 1, 1, 1]);
        expect(config.getLinesDefinitions().getLineDefinition("1")).toEqual([0, 0, 0, 0, 0]);
        expect(config.getLinesDefinitions().getLineDefinition("2")).toEqual([2, 2, 2, 2, 2]);
        expect(config.getLinesDefinitions().getLinesIds()).toEqual(["0", "1", "2"]);

        expect(config.getSymbolsSequences().length).toEqual(config.getReelsNumber());
        config.getSymbolsSequences().forEach((seq) => {
            config.getAvailableSymbols().forEach((symbol) => {
                // Check if every available symbol exists on each sequence
                expect(seq.toArray()).toContain(symbol);
            });
        });

        expect(config.getAvailableSymbols()).toContain("A");
        expect(config.getAvailableSymbols()).toContain("K");
        expect(config.getAvailableSymbols()).toContain("Q");
        expect(config.getAvailableSymbols()).toContain("J");
        expect(config.getAvailableSymbols()).toContain("10");
        expect(config.getAvailableSymbols()).toContain("9");
        expect(config.getAvailableSymbols()).toContain("W");
        expect(config.getAvailableSymbols()).toContain("S");

        config.getAvailableBets().forEach((bet) => {
            config.getAvailableSymbols().forEach((symbol) => {
                for (let num = 1; num <= 3; num++) {
                    if (!config.isSymbolWild(symbol)) {
                        testPaytableSymbol(config.getPaytable(), symbol, num + 2, bet, bet * num);
                    }
                }
            });
        });
    });

    it("should check if symbol is wild", () => {
        expect(config.isSymbolWild("W")).toBeTruthy();
        expect(config.isSymbolWild("A")).toBeFalsy();
    });

    it("should check if symbol is scatter", () => {
        expect(config.isSymbolScatter("S")).toBeTruthy();
        expect(config.isSymbolScatter("A")).toBeFalsy();
    });

    it("should set bet", () => {
        config.setBet(10);
        expect(config.getBet()).toBe(10);
    });

    it("should set wild symbol id", () => {
        config.setWildSymbols(["WILD"]);
        expect(config.getWildSymbols()).toEqual(["WILD"]);
    });

    it("should set paytable", () => {
        const d = new Paytable([1, 2, 3], ["A", "B", "C"], [""], 5);
        config.setPaytable(d);
        expect(config.getPaytable()).toBe(d);
    });
});
