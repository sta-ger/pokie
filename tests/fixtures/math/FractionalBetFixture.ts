import {VideoSlotConfig, VideoSlotSession, SymbolsSequence, SymbolsCombinationsGenerator, SeededRandomNumberGenerator, type GameBlueprint} from "pokie";

export const FRACTIONAL_BET_STAKES = [1, 0.01, 0.1, 1.5, 1e-7];

/** Complete intake model; mixed strips have eight equally weighted stop tuples. */
export function fractionalBetBlueprint(availableBets = [0.01], mixed = false): GameBlueprint {
    return {
        manifest: {id: "math-probe", name: "Math probe", version: "0.1.0"},
        reels: 3, rows: 1, symbols: ["A", "B"], wilds: [], scatters: [],
        paylines: [[0, 0, 0]],
        reelStrips: Array.from({length: 3}, () => mixed ? ["A", "B"] : ["A"]),
        paytable: {A: {3: 5}, B: {3: 2}}, availableBets,
    };
}

/** Independent calculation for this one horizontal line (no wilds/scatters). */
export function screenMultiplier(screen: readonly (readonly unknown[])[]): number {
    if (screen.every(reel => reel[0] === "A")) return 5;
    if (screen.every(reel => reel[0] === "B")) return 2;
    return 0;
}

/** Relative error budget, with a tiny floor that cannot hide a 1e-7 payout. */
export function amountTolerance(expected: number): number {
    return 32 * Number.EPSILON * Math.max(Math.abs(expected), 1e-7);
}

/** The same assembly order as generated createConfig; bets precede paytable creation. */
export function fractionalBetConfig(bets = FRACTIONAL_BET_STAKES): VideoSlotConfig {
    const blueprint = fractionalBetBlueprint(bets);
    const config = new VideoSlotConfig();
    config.setAvailableBets(bets);
    config.setReelsNumber(3);
    config.setReelsSymbolsNumber(1);
    config.setWildSymbols([]);
    config.setScatterSymbols([]);
    config.setAvailableSymbols(blueprint.symbols);
    config.setSymbolsSequences(blueprint.reelStrips!.map(strip => new SymbolsSequence().fromArray(strip)));
    config.getPaytable().setPayoutForSymbol("A", 3, 5);
    config.getPaytable().setPayoutForSymbol("B", 3, 2);
    return config;
}

export function fractionalBetSession(bets = FRACTIONAL_BET_STAKES): VideoSlotSession {
    const config = fractionalBetConfig(bets);
    return new VideoSlotSession(config, new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator("0")));
}

/** Observed on the unmodified P9 baseline, seed STRING "0", after constructor draws. */
export const FRACTIONAL_MIXED_CONTINUATION = [
    {screen: [["B"], ["B"], ["B"]], rngState: 3289482349},
    {screen: [["B"], ["A"], ["A"]], rngState: 194245196},
    {screen: [["A"], ["A"], ["B"]], rngState: 1393975339},
    {screen: [["B"], ["B"], ["B"]], rngState: 2593705482},
    {screen: [["B"], ["B"], ["B"]], rngState: 3793435625},
    {screen: [["A"], ["A"], ["B"]], rngState: 698198472},
    {screen: [["A"], ["A"], ["A"]], rngState: 1897928615},
    {screen: [["B"], ["A"], ["B"]], rngState: 3097658758},
];
