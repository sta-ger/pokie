import {runInNewContext} from "node:vm";
import * as api from "@fromstan/pokie";
import {renderBuiltGameModule} from "../../../src/generated/renderBuiltGameModule.js";

export const weightedBlueprint: api.GameBlueprint = {
    manifest: {id: "weighted-whole", name: "Weighted whole", version: "1"}, reels: 2, rows: 1,
    symbols: ["A", "B", "S"], wilds: [], scatters: [], availableBets: [1], paytable: {A: {2: 4}},
    reelSequences: [
        {type: "weighted", variants: [{id: "all-A", symbols: ["A", "A"], weight: 1}, {id: "all-B", symbols: ["B", "B"], weight: 3}]},
        {type: "exact", symbols: ["A", "A"]},
    ],
};

/** Execute the production generated module with this checkout's actual public API. */
export function weightedGame(blueprint: api.GameBlueprint = weightedBlueprint): api.PokieGame {
    const module: {exports: unknown} = {exports: {}};
    const require = (id: string): unknown => {
        if (id !== "@fromstan/pokie") throw new Error(`Unexpected require ${id}`);
        return api;
    };
    runInNewContext(renderBuiltGameModule(blueprint, "1.3.0"), {require, module});
    return module.exports as api.PokieGame;
}

export function weightedConfig(rows = 1): api.VideoSlotConfig {
    const config = new api.VideoSlotConfig();
    config.setReelsNumber(2);
    config.setReelsSymbolsNumber(rows);
    config.setAvailableSymbols(["A", "B", "C", "D"]);
    config.setWildSymbols([]);
    config.setScatterSymbols([]);
    config.setAvailableBets([1]);
    config.setPaytable(new api.Paytable([1]));
    config.getPaytable().setPayoutForSymbol("A", 2, 4);
    config.setSymbolsSequences([
        new api.WeightedSymbolsSequence([{id: "a", symbols: ["A", "C"], weight: 1}, {id: "b", symbols: ["B", "D"], weight: 3}]),
        new api.SymbolsSequence().fromArray(["A", "A"]),
    ]);
    return config;
}
