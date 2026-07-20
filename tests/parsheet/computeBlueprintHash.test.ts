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

    describe("winModel / mechanics / betModes", () => {
        it("changes when winModel changes", () => {
            const withLines: GameBlueprint = {...base, winModel: {type: "lines"}};
            const withWays: GameBlueprint = {...base, winModel: {type: "ways"}};

            expect(computeBlueprintHash(withLines)).not.toBe(computeBlueprintHash(base));
            expect(computeBlueprintHash(withLines)).not.toBe(computeBlueprintHash(withWays));
        });

        it("changes when a clusters winModel's minimumClusterSize changes", () => {
            const withFour: GameBlueprint = {...base, winModel: {type: "clusters", minimumClusterSize: 4}};
            const withFive: GameBlueprint = {...base, winModel: {type: "clusters", minimumClusterSize: 5}};

            expect(computeBlueprintHash(withFour)).not.toBe(computeBlueprintHash(withFive));
        });

        it("is independent of mechanics.freeGames.awardsByCount key order", () => {
            const inOrder: GameBlueprint = {...base, mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {"3": 8, "4": 15}}}};
            const reordered: GameBlueprint = {...base, mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {"4": 15, "3": 8}}}};

            expect(computeBlueprintHash(inOrder)).toBe(computeBlueprintHash(reordered));
        });

        it("changes when mechanics.freeGames content actually changes", () => {
            const withMechanics: GameBlueprint = {...base, mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {"3": 8}}}};
            const withDifferentAward: GameBlueprint = {...base, mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {"3": 9}}}};

            expect(computeBlueprintHash(withMechanics)).not.toBe(computeBlueprintHash(base));
            expect(computeBlueprintHash(withMechanics)).not.toBe(computeBlueprintHash(withDifferentAward));
        });

        it("changes when betModes content or order changes, but hashes an empty betModes array the same as omitting it", () => {
            const withBetModes: GameBlueprint = {...base, betModes: [{id: "base"}, {id: "buy-bonus", costMultiplier: 100}]};
            const withReorderedBetModes: GameBlueprint = {...base, betModes: [{id: "buy-bonus", costMultiplier: 100}, {id: "base"}]};
            const withEmptyBetModes: GameBlueprint = {...base, betModes: []};

            expect(computeBlueprintHash(withBetModes)).not.toBe(computeBlueprintHash(base));
            expect(computeBlueprintHash(withBetModes)).not.toBe(computeBlueprintHash(withReorderedBetModes));
            expect(computeBlueprintHash(withEmptyBetModes)).toBe(computeBlueprintHash(base));
        });

        it("distinguishes betModes entries that differ only by an optional label/costMultiplier", () => {
            const withLabel: GameBlueprint = {...base, betModes: [{id: "base", label: "Base Game"}]};
            const withoutLabel: GameBlueprint = {...base, betModes: [{id: "base"}]};

            expect(computeBlueprintHash(withLabel)).not.toBe(computeBlueprintHash(withoutLabel));
        });

        // Regression: the explicit, opt-in runtime-semantics fields (runtimeType/isDefault/
        // forcedFreeGames -- see gamepackage/BetMode.ts's own doc comment) must never be silently
        // dropped from provenance -- two blueprints differing only in whether a mode is actually
        // wired as a real runtime ante/buy-feature mode are NOT the same blueprint, even though they'd
        // hash identically if these fields weren't canonicalized.
        it("distinguishes betModes entries that differ only by the explicit runtime-semantics fields", () => {
            const metadataOnly: GameBlueprint = {...base, betModes: [{id: "base", costMultiplier: 1}]};
            const withRuntimeType: GameBlueprint = {...base, betModes: [{id: "base", costMultiplier: 1, runtimeType: "base"}]};
            const withIsDefault: GameBlueprint = {
                ...base,
                betModes: [{id: "base", costMultiplier: 1, runtimeType: "base", isDefault: true}],
            };
            const withForcedFreeGames: GameBlueprint = {
                ...base,
                betModes: [{id: "buy", runtimeType: "buyFeature", costMultiplier: 1, forcedFreeGames: 10}],
            };
            const withDifferentForcedFreeGames: GameBlueprint = {
                ...base,
                betModes: [{id: "buy", runtimeType: "buyFeature", costMultiplier: 1, forcedFreeGames: 20}],
            };

            expect(computeBlueprintHash(withRuntimeType)).not.toBe(computeBlueprintHash(metadataOnly));
            expect(computeBlueprintHash(withIsDefault)).not.toBe(computeBlueprintHash(withRuntimeType));
            expect(computeBlueprintHash(withForcedFreeGames)).not.toBe(computeBlueprintHash(withDifferentForcedFreeGames));
        });

        // Regression: targetRtp (see gamepackage/BetMode.ts's own doc comment) must never be silently
        // dropped from provenance either -- otherwise a blueprint edit that ONLY changes a mode's
        // declared RTP target would hash identically to the unedited one, hiding a real change.
        it("distinguishes betModes entries that differ only by targetRtp", () => {
            const withoutTargetRtp: GameBlueprint = {...base, betModes: [{id: "base", costMultiplier: 1}]};
            const withTargetRtp: GameBlueprint = {...base, betModes: [{id: "base", costMultiplier: 1, targetRtp: 0.94}]};
            const withDifferentTargetRtp: GameBlueprint = {...base, betModes: [{id: "base", costMultiplier: 1, targetRtp: 0.965}]};

            expect(computeBlueprintHash(withTargetRtp)).not.toBe(computeBlueprintHash(withoutTargetRtp));
            expect(computeBlueprintHash(withTargetRtp)).not.toBe(computeBlueprintHash(withDifferentTargetRtp));
        });
    });
});
