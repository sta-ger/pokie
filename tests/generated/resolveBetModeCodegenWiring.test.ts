import {BetModeRuntimeSemanticsInvalidError, GameBlueprint, resolveBetModeCodegenWiring} from "pokie";

function buildBlueprint(overrides: Partial<GameBlueprint> = {}): GameBlueprint {
    return {
        manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B"],
        paytable: {A: {3: 5}, B: {3: 2}},
        ...overrides,
    };
}

describe("resolveBetModeCodegenWiring", () => {
    it("returns undefined when there are no bet modes at all", () => {
        expect(resolveBetModeCodegenWiring(buildBlueprint())).toBeUndefined();
    });

    it("returns undefined for the old pure-metadata shape (costMultiplier only, no runtimeType) -- never throws", () => {
        const blueprint = buildBlueprint({betModes: [{id: "base"}, {id: "buy-bonus", costMultiplier: 100}]});

        expect(resolveBetModeCodegenWiring(blueprint)).toBeUndefined();
    });

    it("resolves a fully-determined base + ante contract", () => {
        const blueprint = buildBlueprint({
            betModes: [
                {id: "base", runtimeType: "base", isDefault: true},
                {id: "ante", runtimeType: "ante", costMultiplier: 1.25},
            ],
        });

        expect(resolveBetModeCodegenWiring(blueprint)).toEqual({defaultModeId: "base", buyFeatureModes: []});
    });

    it("resolves a fully-determined base + buyFeature contract, including the forced free games count", () => {
        const blueprint = buildBlueprint({
            betModes: [
                {id: "base", runtimeType: "base", isDefault: true},
                {id: "buy-bonus", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 10},
            ],
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8}}},
        });

        expect(resolveBetModeCodegenWiring(blueprint)).toEqual({
            defaultModeId: "base",
            buyFeatureModes: [{id: "buy-bonus", forcedFreeGames: 10}],
        });
    });

    it("resolves multiple buyFeature modes with different costs/grants, each reported in buyFeatureModes", () => {
        const blueprint = buildBlueprint({
            betModes: [
                {id: "base", runtimeType: "base", isDefault: true},
                {id: "buy-10", runtimeType: "buyFeature", costMultiplier: 50, forcedFreeGames: 10},
                {id: "buy-20", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 20},
            ],
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8}}},
        });

        expect(resolveBetModeCodegenWiring(blueprint)).toEqual({
            defaultModeId: "base",
            buyFeatureModes: [
                {id: "buy-10", forcedFreeGames: 10},
                {id: "buy-20", forcedFreeGames: 20},
            ],
        });
    });

    it("throws for an incomplete opt-in (some modes missing runtimeType)", () => {
        const blueprint = buildBlueprint({betModes: [{id: "base", runtimeType: "base", isDefault: true}, {id: "legacy"}]});

        expect(() => resolveBetModeCodegenWiring(blueprint)).toThrow(BetModeRuntimeSemanticsInvalidError);
    });

    it("throws with zero or multiple default modes", () => {
        const noDefault = buildBlueprint({betModes: [{id: "base", runtimeType: "base"}]});
        const twoDefaults = buildBlueprint({
            betModes: [
                {id: "base", runtimeType: "base", isDefault: true},
                {id: "ante", runtimeType: "ante", costMultiplier: 1.25, isDefault: true},
            ],
        });

        expect(() => resolveBetModeCodegenWiring(noDefault)).toThrow(BetModeRuntimeSemanticsInvalidError);
        expect(() => resolveBetModeCodegenWiring(twoDefaults)).toThrow(BetModeRuntimeSemanticsInvalidError);
    });

    it("throws when the default mode is buyFeature", () => {
        const blueprint = buildBlueprint({
            betModes: [{id: "buy-bonus", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 10, isDefault: true}],
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8}}},
        });

        expect(() => resolveBetModeCodegenWiring(blueprint)).toThrow(BetModeRuntimeSemanticsInvalidError);
    });

    it("throws for a buyFeature mode without mechanics.freeGames configured", () => {
        const blueprint = buildBlueprint({
            betModes: [
                {id: "base", runtimeType: "base", isDefault: true},
                {id: "buy-bonus", runtimeType: "buyFeature", costMultiplier: 100, forcedFreeGames: 10},
            ],
        });

        expect(() => resolveBetModeCodegenWiring(blueprint)).toThrow(BetModeRuntimeSemanticsInvalidError);
    });

    it("throws for an ante mode missing costMultiplier, or a base mode with a non-1 costMultiplier", () => {
        const anteMissingCost = buildBlueprint({
            betModes: [
                {id: "base", runtimeType: "base", isDefault: true},
                {id: "ante", runtimeType: "ante"},
            ],
        });
        const baseWrongCost = buildBlueprint({
            betModes: [{id: "base", runtimeType: "base", isDefault: true, costMultiplier: 2}],
        });

        expect(() => resolveBetModeCodegenWiring(anteMissingCost)).toThrow(BetModeRuntimeSemanticsInvalidError);
        expect(() => resolveBetModeCodegenWiring(baseWrongCost)).toThrow(BetModeRuntimeSemanticsInvalidError);
    });

    it("throws for a buyFeature mode missing costMultiplier or forcedFreeGames", () => {
        const missingCost = buildBlueprint({
            betModes: [
                {id: "base", runtimeType: "base", isDefault: true},
                {id: "buy-bonus", runtimeType: "buyFeature", forcedFreeGames: 10},
            ],
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8}}},
        });
        const missingGrant = buildBlueprint({
            betModes: [
                {id: "base", runtimeType: "base", isDefault: true},
                {id: "buy-bonus", runtimeType: "buyFeature", costMultiplier: 100},
            ],
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8}}},
        });

        expect(() => resolveBetModeCodegenWiring(missingCost)).toThrow(BetModeRuntimeSemanticsInvalidError);
        expect(() => resolveBetModeCodegenWiring(missingGrant)).toThrow(BetModeRuntimeSemanticsInvalidError);
    });
});
