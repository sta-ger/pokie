import vm from "node:vm";
import * as api from "@fromstan/pokie";
import type {GameBlueprint, PokieGame, ScreenGeometry} from "@fromstan/pokie";

export const overscanGeometry: ScreenGeometry = {
    generated: {reels: 5, rows: 7}, visible: {rowOffset: 1, rows: 3}, evaluated: {rowOffset: 2, rows: 3}, paylineSpace: "evaluated",
};
export const overscanBlueprint: GameBlueprint = {
    manifest: {id: "overscan-contract", name: "Overscan Contract", version: "0.1.0"},
    reels: 5, rows: 3, screenGeometry: overscanGeometry,
    symbols: ["A", "B", "W", "S"], wilds: ["W"], scatters: ["S"], availableBets: [0.05, 7.5, 1e-7, 1],
    paylines: [[0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2]],
    paytable: {A: {"5": 10000}, B: {"5": 1}, W: {"5": 50000}, S: {"2": 1000, "3": 3000, "5": 5000}},
    reelStrips: Array.from({length: 5}, () => ["S", "W", "B", "B", "B", "A", "S", "A"]),
};

export function createOverscanGame(blueprint: GameBlueprint = overscanBlueprint): PokieGame {
    const module = {exports: {} as {default?: PokieGame}};
    vm.runInNewContext(`(function(require, module, exports) {${api.renderBuiltGameModule(blueprint, "1.3.0")}\n})`)(
        (name: string) => {
            if (name !== "@fromstan/pokie") throw new Error(`Unexpected generated import: ${name}`);
            return api;
        }, module, module.exports,
    );
    const generated = (module.exports.default ?? module.exports) as PokieGame;
    return {...generated, createSession(context) {
        const session = generated.createSession(context);
        session.setBet(blueprint.availableBets?.[0] ?? 1);
        return session;
    }};
}

export function overscanConfig(): api.VideoSlotConfig {
    const config = new api.VideoSlotConfig();
    config.setAvailableBets(overscanBlueprint.availableBets!);
    config.setBet(1);
    config.setAvailableSymbols(overscanBlueprint.symbols);
    config.setWildSymbols(["W"]);
    config.setScatterSymbols(["S"]);
    config.setScreenGeometry(overscanGeometry);
    config.setSymbolsSequences(overscanBlueprint.reelStrips!.map(strip => new api.SymbolsSequence().fromArray(strip)));
    const paytable = new api.Paytable(config.getAvailableBets());
    for (const [symbol, payouts] of Object.entries(overscanBlueprint.paytable)) {
        for (const [count, multiplier] of Object.entries(payouts)) paytable.setPayoutForSymbol(symbol, Number(count), multiplier);
    }
    paytable.setPayoutForSymbol("S", 1, 1000);
    paytable.setPayoutForSymbol("S", 10, 1000000000);
    config.setLinesDefinitions(new api.CustomLinesDefinitions().fromMap({"0": [0, 0, 0, 0, 0], "1": [1, 1, 1, 1, 1], "2": [2, 2, 2, 2, 2]}));
    config.setPaytable(paytable);
    return config;
}

export function adversarialScreen(): string[][] {
    return Array.from({length: 5}, () => ["S", "W", "B", "B", "B", "A", "S"]);
}
