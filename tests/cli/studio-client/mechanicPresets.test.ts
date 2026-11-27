import {
    featureChainPreset,
    holdAndWinPreset,
    jackpotPreset,
    weightedBonusPreset,
    wildModifiersPreset,
} from "../../../cli/studio-client/src/domain/mechanicPresets.js";

const symbols = ["A", "K", "Q", "J"];
const wilds = ["W"];

describe("producer mechanic presets", () => {
    it("scales cascades, respins and collection from safe to generous", () => {
        expect(featureChainPreset("cascade", symbols, "safe")).toEqual({maxCascades: 20});
        expect(featureChainPreset("cascade", symbols, "conservative")).toEqual({maxCascades: 10});
        expect(featureChainPreset("cascade", symbols, "generous")).toEqual({maxCascades: 50});

        const safeRespins = featureChainPreset("respins", symbols, "safe");
        const generousRespins = featureChainPreset("respins", symbols, "generous");
        expect(safeRespins).toMatchObject({trigger: {symbolId: "A", minimumCount: 1}, grant: 3, maxRespins: 30});
        expect(generousRespins).toMatchObject({grant: 5, maxRespins: 50});

        const conservativeCollection = featureChainPreset("collection", symbols, "conservative");
        expect(conservativeCollection).toMatchObject({symbolId: "A", contribution: 1, threshold: 20, cap: 20, payout: 10});
    });

    it("changes weighted-bonus weight and payout shape without changing the trigger symbol", () => {
        const safe = weightedBonusPreset(symbols, "safe");
        const generous = weightedBonusPreset(symbols, "generous");
        expect(safe.trigger).toEqual({symbolId: "A", minimumCount: 1});
        expect(safe.outcomes.map((outcome) => [outcome.weight, outcome.payout])).toEqual([[1, 1], [3, 5]]);
        expect(generous.outcomes.map((outcome) => [outcome.weight, outcome.payout])).toEqual([[10, 2], [1, 25]]);
        expect(generous.feature.maxDuration).toBe(15);
    });

    it("sets a wild multiplier for conservative and generous starts", () => {
        expect(wildModifiersPreset(wilds, "safe")).toEqual({wilds: [{symbol: "W"}], rules: []});
        expect(wildModifiersPreset(wilds, "conservative")).toEqual({wilds: [{symbol: "W", factor: 2}], rules: []});
        expect(wildModifiersPreset(wilds, "generous")).toEqual({wilds: [{symbol: "W", factor: 3}], rules: []});
        expect(wildModifiersPreset([], "generous")).toEqual({wilds: [], rules: []});
    });

    it("scales Hold & Win respins and collectible values", () => {
        expect(holdAndWinPreset(symbols, "safe")).toMatchObject({
            minimumCount: 1,
            initialRespins: 3,
            symbolEffects: {A: {kind: "value", amount: 1}},
        });
        expect(holdAndWinPreset(symbols, "conservative")).toMatchObject({minimumCount: 2, initialRespins: 2});
        expect(holdAndWinPreset(symbols, "generous")).toMatchObject({
            minimumCount: 1,
            initialRespins: 5,
            symbolEffects: {A: {kind: "value", amount: 2}},
        });
    });

    it("scales jackpot pool, contribution and trigger count", () => {
        expect(jackpotPreset(symbols, "safe")).toMatchObject({
            pool: {id: "mini", type: "fixed", amount: 10},
            contribution: {type: "percentage", percentage: 0.01},
            trigger: {type: "symbol-count", symbolId: "A", minimumCount: 1},
        });
        expect(jackpotPreset(symbols, "conservative")).toMatchObject({
            pool: {amount: 25},
            contribution: {percentage: 0.005},
            trigger: {minimumCount: 2},
        });
        expect(jackpotPreset(symbols, "generous")).toMatchObject({pool: {amount: 100}});
    });
});
