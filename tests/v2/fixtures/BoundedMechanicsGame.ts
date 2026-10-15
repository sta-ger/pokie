import type {GameBlueprint, AUTHORED_BOUNDED_MECHANIC_CATALOG} from "../../../src/index.js";
export function boundedBlueprint(id: typeof AUTHORED_BOUNDED_MECHANIC_CATALOG[number] = "collection"): GameBlueprint {
    return {
        manifest: {id: `bounded-${id}`, name: `Bounded ${id}`, version: "1.0.0"}, reels: 3, rows: 1,
        symbols: ["A", "B", "C"], wilds: [], scatters: [], availableBets: [0.05, 7.5, 1e-7],
        reelStrips: [["A", "B", "C"], ["B", "C", "A"], ["C", "A", "B"]], paytable: {A: {3: 2}, B: {3: 0}},
        mechanics: {
            ...(id.includes("cascade") ? {cascade: {maxCascades: 10}} : {}),
            ...(id.includes("respins") ? {respins: {trigger: {symbolId: "C", minimumCount: 1}, grant: 2, retrigger: "reset" as const, maxRespins: 8}} : {}),
            ...(id.includes("collection") ? {collection: {symbolId: "C", contribution: 1, threshold: 4, cap: 5, reset: "subtract-threshold" as const, payout: 10}} : {}),
        },
    };
}
