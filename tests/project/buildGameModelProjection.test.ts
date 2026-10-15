import {PackageBlueprintExtraction} from "../../src/generated/PackageBlueprintExtraction.js";
import {buildPackageGameModelProjection, buildGameModelProjection} from "../../src/project/buildGameModelProjection.js";
import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";

const BASE_BLUEPRINT: GameBlueprint = {
    manifest: {id: "a", name: "A", version: "1.0.0"},
    reels: 3,
    rows: 3,
    symbols: ["A", "B", "S"],
    wilds: ["A"],
    scatters: ["S"],
    paytable: {A: {3: 5}, B: {3: 2}},
    availableBets: [1, 2],
};

const BOUNDED_BLUEPRINT: GameBlueprint = {...BASE_BLUEPRINT, reelStrips: [["A", "S"], ["A", "S"], ["A", "S"]], mechanics: {
    cascade: {maxCascades: 2},
    respins: {trigger: {symbolId: "S", minimumCount: 1}, grant: 2, retrigger: "none", maxRespins: 8},
    collection: {symbolId: "S", contribution: 0, threshold: 4, cap: 5, reset: "zero", payout: 0},
}};

describe("buildGameModelProjection", () => {
    it.each([
        "mechanics", "mechanics.cascade", "mechanics.cascade.maxCascades",
        "mechanics.respins", "mechanics.respins.trigger", "mechanics.respins.trigger.symbolId",
        "mechanics.respins.trigger.minimumCount", "mechanics.respins.grant", "mechanics.respins.retrigger", "mechanics.respins.maxRespins",
        "mechanics.collection", "mechanics.collection.symbolId", "mechanics.collection.contribution",
        "mechanics.collection.threshold", "mechanics.collection.cap", "mechanics.collection.reset", "mechanics.collection.payout",
    ])("diagnoses malformed %s without projecting unsafe fields or discarding other sections", field => {
        const valid = buildGameModelProjection(BOUNDED_BLUEPRINT);
        for (const value of [{invalid: true}, [], null, true, "invalid"]) {
            const draft = JSON.parse(JSON.stringify(BOUNDED_BLUEPRINT)) as Record<string, unknown>;
            const keys = field.split(".");
            const parent = keys.slice(0, -1).reduce((data, key) => data[key] as Record<string, unknown>, draft);
            parent[keys[keys.length - 1]] = value;
            const before = JSON.stringify(draft);
            const projection = buildGameModelProjection(draft as unknown as GameBlueprint);
            expect(projection.mechanics).toMatchObject({status: "invalid", reason: expect.stringContaining(field.includes(".trigger.") ? "mechanics.respins.trigger" : field)});
            expect(projection).toEqual({...valid, mechanics: projection.mechanics});
            expect(JSON.stringify(draft)).toBe(before);
        }
    });

    it("recovers from a missing trigger and from preflight-invalid values on subsequent projections", () => {
        const draft = JSON.parse(JSON.stringify(BOUNDED_BLUEPRINT)) as GameBlueprint;
        const valid = buildGameModelProjection(draft);
        expect(valid.mechanics).toEqual({status: "available", data: BOUNDED_BLUEPRINT.mechanics});
        draft.mechanics = {respins: {grant: 2}} as GameBlueprint["mechanics"];
        expect(buildGameModelProjection(draft).mechanics).toMatchObject({status: "invalid", reason: expect.stringContaining("mechanics.respins.trigger")});
        draft.mechanics = {...BOUNDED_BLUEPRINT.mechanics, cascade: {maxCascades: 0}};
        expect(buildGameModelProjection(draft).mechanics).toMatchObject({status: "invalid", reason: expect.stringContaining("mechanics.cascade.maxCascades")});
        draft.mechanics = BOUNDED_BLUEPRINT.mechanics;
        expect(buildGameModelProjection(draft)).toEqual(valid);
        expect(buildGameModelProjection(draft)).toEqual(valid);
    });

    it.each(["respins", "collection"] as const)("returns field diagnostics for malformed %s JSON values", key => {
        const draft = JSON.parse(JSON.stringify(BOUNDED_BLUEPRINT));
        draft.mechanics[key][key === "respins" ? "maxRespins" : "threshold"] = {toString: null, valueOf: null};
        const authored = JSON.stringify(draft);
        const valid = buildGameModelProjection(BOUNDED_BLUEPRINT);
        const projection = buildGameModelProjection(draft);
        const field = key === "respins" ? "maxRespins" : "threshold";
        const message = key === "respins" ? "must be an integer in [1, 90]." : "must be finite and positive.";
        expect(projection.mechanics).toEqual({status: "invalid", reason: `blueprint-mechanics-invalid: mechanics.${key}.${field}: ${message}`});
        expect(projection).toEqual({...valid, mechanics: projection.mechanics});
        expect(JSON.stringify(draft)).toBe(authored);
        draft.mechanics = BOUNDED_BLUEPRINT.mechanics;
        expect(buildGameModelProjection(draft)).toEqual(valid);
    });

    it("projects authored zeros and missing counts without filling entries", () => {
        expect(buildGameModelProjection({...BASE_BLUEPRINT, reels: 5, paytable: {A: {5: 10}, B: {5: 0}}}).paytable).toEqual({
            status: "available", data: [{symbolId: "A", matchCount: 5, payout: 10}, {symbolId: "B", matchCount: 5, payout: 0}],
        });
        expect(buildGameModelProjection({...BASE_BLUEPRINT, paytable: {A: {3: 0}}}).paytable).toEqual({
            status: "available", data: [{symbolId: "A", matchCount: 3, payout: 0}],
        });
    });

    it("derives every section as \"available\" from a full GameBlueprint, without a caller re-deriving any of it", () => {
        const projection = buildGameModelProjection(BASE_BLUEPRINT);

        expect(projection.basics).toEqual({status: "available", data: {id: "a", name: "A", version: "1.0.0"}});
        expect(projection.layout).toEqual({
            status: "available",
            data: {reels: 3, rows: 3, winModel: {type: "lines"}, paylineCount: 0},
        });
        expect(projection.symbols).toEqual({
            status: "available",
            data: [
                {id: "A", isWild: true, isScatter: false},
                {id: "B", isWild: false, isScatter: false},
                {id: "S", isWild: false, isScatter: true},
            ],
        });
        expect(projection.reels.status).toEqual("available");
        expect(projection.reels.status === "available" && projection.reels.data.generationMode).toEqual("default");
        expect(projection.paytable).toEqual({
            status: "available",
            data: [
                {symbolId: "A", matchCount: 3, payout: 5},
                {symbolId: "B", matchCount: 3, payout: 2},
            ],
        });
        expect(projection.betsAndModes).toEqual({status: "available", data: {availableBets: [1, 2], betModes: []}});
        expect(projection.mechanics).toEqual({status: "available", data: {freeGames: undefined}});
        expect(projection.limits).toEqual({status: "available", data: {minBet: 1, maxBet: 2}});
    });

    it("reports the reel generation mode from whichever of reelStrips/reelStripGeneration/symbolWeights is actually set", () => {
        // The reels section's own full Game window/Full strips/Analysis/sample content -- for every
        // generation mode -- is buildGameModelReels' own concern, exercised in depth by
        // tests/project/buildGameModelReels.test.ts; this just confirms buildGameModelProjection wires
        // its result straight through as `reels`, never re-deriving the generation mode itself.
        const reelStripsReels = buildGameModelProjection({...BASE_BLUEPRINT, reelStrips: [["A"], ["A"], ["A"]]}).reels;
        expect(reelStripsReels.status).toEqual("available");
        expect(reelStripsReels.status === "available" && reelStripsReels.data.generationMode).toEqual("reelStrips");

        const symbolWeightsReels = buildGameModelProjection({...BASE_BLUEPRINT, symbolWeights: {A: 1}}).reels;
        expect(symbolWeightsReels.status).toEqual("available");
        expect(symbolWeightsReels.status === "available" && symbolWeightsReels.data.generationMode).toEqual("symbolWeights");
    });

    it("omits paylineCount for a non-\"lines\" win model instead of reporting a possibly-misleading 0", () => {
        const projection = buildGameModelProjection({...BASE_BLUEPRINT, winModel: {type: "ways"}, paylines: [[0, 0, 0]]});
        expect(projection.layout).toEqual({status: "available", data: {reels: 3, rows: 3, winModel: {type: "ways"}, paylineCount: undefined}});
    });

    it("carries mechanics.freeGames straight through when configured", () => {
        const projection = buildGameModelProjection({
            ...BASE_BLUEPRINT,
            mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10}}},
        });
        expect(projection.mechanics).toEqual({status: "available", data: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 10}}}});
    });

    it.each<NonNullable<GameBlueprint["mechanics"]>>([
        {holdAndWin: {minimumCount: 1, initialRespins: 2, retriggerPolicy: "reset-on-new-lock", symbolEffects: {A: {kind: "value", amount: 0}}, payout: {type: "sum-with-multiplier", amountsAreBetMultiples: false}}},
        {jackpot: {pool: {id: "mini", type: "fixed", amount: 0}, contribution: {type: "percentage", percentage: 0}, trigger: {type: "symbol-count", symbolId: "S", minimumCount: 1}, award: "single-tier"}},
        {modifiers: {wilds: [{symbol: "A", factor: 2}], rules: []}},
    ])("keeps supported existing mechanic consumers available without additional declarations: %j", mechanics => {
        expect(buildGameModelProjection({...BASE_BLUEPRINT, mechanics}).mechanics).toEqual({status: "available", data: mechanics});
    });

    it("maps every bet mode field through verbatim", () => {
        const projection = buildGameModelProjection({
            ...BASE_BLUEPRINT,
            betModes: [{id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100, targetRtp: 0.96}],
        });
        expect(projection.betsAndModes).toEqual({
            status: "available",
            data: {availableBets: [1, 2], betModes: [{id: "buy-bonus", label: "Buy Bonus", costMultiplier: 100, targetRtp: 0.96}]},
        });
    });

    it("derives minBet/maxBet as the plain min/max of availableBets, and omits both when there are none", () => {
        const withBets = buildGameModelProjection({...BASE_BLUEPRINT, availableBets: [5, 1, 20, 2]});
        expect(withBets.limits).toEqual({status: "available", data: {minBet: 1, maxBet: 20}});

        const withoutBets = buildGameModelProjection({...BASE_BLUEPRINT, availableBets: []});
        expect(withoutBets.limits).toEqual({status: "available", data: {minBet: undefined, maxBet: undefined}});
    });

    it("marks every section \"unavailable\" with the given reason, and basics too, when no blueprint and no fallback manifest is given", () => {
        const projection = buildGameModelProjection(undefined, {reason: "no tracked source recorded"});

        expect(projection.basics).toEqual({status: "unavailable", reason: "no tracked source recorded"});
        expect(projection.layout).toEqual({status: "unavailable", reason: "no tracked source recorded"});
        expect(projection.symbols).toEqual({status: "unavailable", reason: "no tracked source recorded"});
        expect(projection.reels).toEqual({status: "unavailable", reason: "no tracked source recorded"});
        expect(projection.paytable).toEqual({status: "unavailable", reason: "no tracked source recorded"});
        expect(projection.betsAndModes).toEqual({status: "unavailable", reason: "no tracked source recorded"});
        expect(projection.mechanics).toEqual({status: "unavailable", reason: "no tracked source recorded"});
        expect(projection.limits).toEqual({status: "unavailable", reason: "no tracked source recorded"});
    });

    it("still reports basics \"available\" from a fallback manifest even when the full blueprint isn't available", () => {
        const projection = buildGameModelProjection(undefined, {
            manifest: {id: "a", name: "A", version: "1.0.0"},
            reason: "no tracked source recorded",
        });

        expect(projection.basics).toEqual({status: "available", data: {id: "a", name: "A", version: "1.0.0"}});
        expect(projection.layout).toEqual({status: "unavailable", reason: "no tracked source recorded"});
    });

    it("threads a custom sharedWeightsSampleSeed through to the reels section's own dynamic inspection sample", () => {
        const blueprint: GameBlueprint = {...BASE_BLUEPRINT, symbolWeights: {A: 1, B: 3}};
        const defaultProjection = buildGameModelProjection(blueprint);
        const rerolledProjection = buildGameModelProjection(blueprint, undefined, {sharedWeightsSampleSeed: 99});

        if (defaultProjection.reels.status !== "available" || rerolledProjection.reels.status !== "available") {
            throw new Error("expected an available reels section");
        }
        expect(rerolledProjection.reels.data.sharedWeightsSample!.seed).toEqual(99);
        expect(rerolledProjection.reels.data).not.toEqual(defaultProjection.reels.data);
    });
});


it("keeps mixed supported package sections inspectable without masking unsupported mechanics", async () => {
    const blueprint: GameBlueprint = {...BASE_BLUEPRINT, wilds: [], reelStrips: [["A", "B", "S"], ["A", "B", "S"], ["A", "B", "S"]]};
    const model = {...blueprint, mechanics: {custom: true}};
    const extraction = await new PackageBlueprintExtraction().extract({getManifest: () => model.manifest, createSession: () => {
        throw new Error("no session");
    }, getModelDescriptor: () => ({descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model: model as unknown as GameBlueprint})});
    const projection = buildPackageGameModelProjection(extraction);
    expect(projection.packageExtraction?.status).toBe("unsupported");
    expect(projection.packageExtraction).toBe(extraction);
    expect(extraction.blueprint).toBeUndefined();
    expect(extraction.blueprintHash).toBeUndefined();
    expect(projection.paytable).toEqual(buildGameModelProjection(blueprint).paytable);
    expect(projection.layout.status).toBe("available");
    expect(projection.symbols.status).toBe("available");
    expect(projection.reels.status).toBe("available");
    expect(projection.mechanics).toMatchObject({status: "unavailable", reason: expect.stringContaining("unsupported-model-field")});
    expect(projection.mechanics).toMatchObject({status: "unavailable", reason: expect.stringContaining("blueprint-mechanics-unknown-field")});
});

it("does not forgive malformed payouts alongside unsupported package mechanics", async () => {
    const model = {...BASE_BLUEPRINT, paytable: {A: {3: -1}}, mechanics: {custom: true}};
    const extraction = await new PackageBlueprintExtraction().extract({getManifest: () => model.manifest, createSession: () => {
        throw new Error("no session");
    }, getModelDescriptor: () => ({descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model: model as unknown as GameBlueprint})});
    const projection = buildPackageGameModelProjection(extraction);
    expect(extraction.status).toBe("malformed");
    expect(extraction.blueprint).toBeUndefined();
    expect(projection.paytable).toMatchObject({status: "unavailable", reason: expect.stringContaining("blueprint-paytable")});
    expect(projection.mechanics).toMatchObject({status: "unavailable", reason: expect.stringContaining("unsupported-model-field")});
});
