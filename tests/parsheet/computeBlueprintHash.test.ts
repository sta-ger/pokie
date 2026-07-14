import {GameBlueprint} from "../../src/generated/GameBlueprint.js";
import {computeBlueprintHash} from "../../src/parsheet/computeBlueprintHash.js";

describe("computeBlueprintHash", () => {
    const base: GameBlueprint = {
        manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        reels: 2,
        rows: 2,
        symbols: ["A", "K"],
        paytable: {A: {"2": 5}, K: {"2": 3}},
    };

    it("is deterministic for the same content", () => {
        expect(computeBlueprintHash(base)).toBe(computeBlueprintHash({...base}));
    });

    it("is independent of the source object's own key order", () => {
        const reordered: GameBlueprint = {
            paytable: base.paytable,
            symbols: base.symbols,
            rows: base.rows,
            reels: base.reels,
            manifest: base.manifest,
        };

        expect(computeBlueprintHash(reordered)).toBe(computeBlueprintHash(base));
    });

    it("is independent of paytable match-count key order", () => {
        const reorderedPaytable: GameBlueprint = {...base, paytable: {A: {"2": 5}, K: {"2": 3}}};
        // Same data, but insert K's key before A's to prove outer-key order doesn't matter either.
        const swapped: GameBlueprint = {...base, paytable: {K: {"2": 3}, A: {"2": 5}}};

        expect(computeBlueprintHash(swapped)).toBe(computeBlueprintHash(reorderedPaytable));
    });

    it("hashes an explicit empty wilds/scatters/paylines/availableBets array the same as omitting them entirely", () => {
        const withEmptyArrays: GameBlueprint = {...base, wilds: [], scatters: [], paylines: [], availableBets: []};
        const withoutThoseFields: GameBlueprint = {...base};

        expect(computeBlueprintHash(withEmptyArrays)).toBe(computeBlueprintHash(withoutThoseFields));
    });

    it("hashes an explicit empty manifest description/author the same as omitting them entirely", () => {
        const withEmptyStrings: GameBlueprint = {...base, manifest: {...base.manifest, description: "", author: ""}};
        const withoutThoseFields: GameBlueprint = {...base};

        expect(computeBlueprintHash(withEmptyStrings)).toBe(computeBlueprintHash(withoutThoseFields));
    });

    it("still distinguishes a genuinely non-empty optional array/string from an absent one", () => {
        const withWilds: GameBlueprint = {...base, wilds: ["A"]};
        const withDescription: GameBlueprint = {...base, manifest: {...base.manifest, description: "hello"}};

        expect(computeBlueprintHash(withWilds)).not.toBe(computeBlueprintHash(base));
        expect(computeBlueprintHash(withDescription)).not.toBe(computeBlueprintHash(base));
    });

    it("changes when reel-order-sensitive array content actually changes", () => {
        const withReelStrips: GameBlueprint = {...base, reelStrips: [["A", "K"], ["K", "A"]]};
        const withReorderedReelStrips: GameBlueprint = {...base, reelStrips: [["K", "A"], ["A", "K"]]};

        expect(computeBlueprintHash(withReelStrips)).not.toBe(computeBlueprintHash(withReorderedReelStrips));
    });
});
