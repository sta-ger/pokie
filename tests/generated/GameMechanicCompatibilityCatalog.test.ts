import {
    DEFAULT_GAME_MECHANIC_COMPATIBILITY_CATALOG,
    DefaultGameMechanicCompatibilityPolicy,
    GameMechanicFeature,
} from "pokie";

describe("DEFAULT_GAME_MECHANIC_COMPATIBILITY_CATALOG", () => {
    test("never lists paylines and winModel together, except the one entry that also declares reelStrips", () => {
        const entriesWithBoth = DEFAULT_GAME_MECHANIC_COMPATIBILITY_CATALOG.filter(
            (entry) => entry.includes("paylines") && entry.includes("winModel"),
        );

        expect(entriesWithBoth).toEqual([["paylines", "reelStrips", "winModel"]]);
    });

    test("has no duplicate entries (as sets)", () => {
        const keys = DEFAULT_GAME_MECHANIC_COMPATIBILITY_CATALOG.map((entry) => [...entry].sort().join(","));
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("DefaultGameMechanicCompatibilityPolicy", () => {
    test("accepts every entry in the default catalog", () => {
        const policy = new DefaultGameMechanicCompatibilityPolicy();

        for (const entry of DEFAULT_GAME_MECHANIC_COMPATIBILITY_CATALOG) {
            expect(policy.isCompatible(entry)).toBe(true);
        }
    });

    test("is insensitive to declaration order and duplicate entries in the feature list", () => {
        const policy = new DefaultGameMechanicCompatibilityPolicy();

        expect(policy.isCompatible(["winModel", "paylines", "reelStrips"])).toBe(true);
        expect(policy.isCompatible(["reelStrips", "reelStrips", "paylines"])).toBe(true);
    });

    test("rejects a feature set that isn't in the catalog", () => {
        const policy = new DefaultGameMechanicCompatibilityPolicy();

        expect(policy.isCompatible(["wilds"])).toBe(false);
        expect(policy.isCompatible(["scatters", "mechanics"])).toBe(false);
        expect(policy.isCompatible(["paylines", "winModel"])).toBe(false);
    });

    test("rejects a superset of an otherwise-known-safe entry", () => {
        const policy = new DefaultGameMechanicCompatibilityPolicy();

        expect(policy.isCompatible(["paylines", "wilds"])).toBe(false);
    });

    test("a custom, narrower catalog can be stricter than the default", () => {
        const policy = new DefaultGameMechanicCompatibilityPolicy([[]]);

        expect(policy.isCompatible([])).toBe(true);
        expect(policy.isCompatible(["paylines"])).toBe(false);
    });

    test("a custom, wider catalog can accept a combination the default catalog doesn't", () => {
        const wilds: readonly GameMechanicFeature[] = ["wilds"];
        const policy = new DefaultGameMechanicCompatibilityPolicy([wilds]);

        expect(policy.isCompatible(["wilds"])).toBe(true);
        expect(policy.isCompatible([])).toBe(false);
    });
});
