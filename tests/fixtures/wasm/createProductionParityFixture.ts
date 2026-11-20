import type {GameBlueprint} from "@fromstan/pokie";

/** The public string-seed reproduction, built from one validated Blueprint. */
export const RNG_PARITY_BLUEPRINT: GameBlueprint = {
    info: {id: "rng-parity", name: "RNG parity", version: "1.0.0"},
    reels: 2, rows: 1, symbols: ["A", "B"],
    reelStrips: [["A", "B"], ["A", "B"]], paylines: [[0, 0]],
    availableBets: [1], paytable: {A: {2: 2}, B: {2: 1}},
};
