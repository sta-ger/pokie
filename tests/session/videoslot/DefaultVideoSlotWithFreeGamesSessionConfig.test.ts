import {CustomLinesDefinitions, Paytable, VideoSlotWithFreeGamesConfig} from "pokie";

describe("DefaultVideoSlotWithFreeGamesSessionConfig", () => {
    let config: VideoSlotWithFreeGamesConfig;

    beforeEach(() => {
        config = new VideoSlotWithFreeGamesConfig();
    });

    it("should get free games for scatters", () => {
        expect(config.getFreeGamesForScatters("S", 3)).toEqual(10);
        expect(config.getFreeGamesForScatters("S", 1)).toEqual(0);
        expect(config.getFreeGamesForScatters("A", 3)).toEqual(0);

        config.setFreeGamesForScatters("SCTR", 3, 20);
        expect(config.getFreeGamesForScatters("SCTR", 3)).toEqual(20);
        expect(config.getFreeGamesForScatters("SCTR", 2)).toEqual(0);
    });

    it("should check if symbol is wild", () => {
        const conf = new VideoSlotWithFreeGamesConfig();
        expect(conf.isSymbolWild("W")).toBeTruthy();
        expect(conf.isSymbolWild("K")).toBeFalsy();
    });

    it("should check if symbol is scatter", () => {
        const conf = new VideoSlotWithFreeGamesConfig();
        expect(conf.isSymbolScatter("S")).toBeTruthy();
        expect(conf.isSymbolScatter("K")).toBeFalsy();
    });

    it("should properly handle default getters/setters", () => {
        const symbols = ["A", "B", "C"];
        const definitions = new CustomLinesDefinitions();
        const reelsNumber = 6;
        const reelsSymbolsNumber = 7;
        const bet = 10;
        const scatters = ["A"];
        const wild = ["WILD"];
        const paytable = new Paytable([1, 2, 3, 4, 5, 10], symbols, wild, reelsNumber);
        const conf = new VideoSlotWithFreeGamesConfig();
        conf.setAvailableSymbols(symbols);
        conf.setReelsNumber(reelsNumber);
        conf.setReelsSymbolsNumber(reelsSymbolsNumber);
        conf.setBet(bet);
        conf.setScatterSymbols(scatters);
        conf.setWildSymbols(wild);
        conf.setPaytable(paytable);
        conf.setLinesDefinitions(definitions);
        expect(conf.getAvailableSymbols()).toEqual(symbols);
        expect(conf.getReelsNumber()).toBe(reelsNumber);
        expect(conf.getReelsSymbolsNumber()).toBe(reelsSymbolsNumber);
        expect(conf.getBet()).toBe(bet);
        expect(conf.getScatterSymbols()).toEqual(scatters);
        expect(conf.getWildSymbols()).toBe(wild);
        expect(conf.getPaytable()).toBe(paytable);
        expect(conf.getLinesDefinitions()).toBe(definitions);
    });
});
