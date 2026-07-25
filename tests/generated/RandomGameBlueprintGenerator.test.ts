import {
    DefaultGameMechanicCompatibilityPolicy,
    GameBlueprintValidator,
    GameMechanicFeature,
    RandomGameBlueprintGenerator,
    RandomGameBlueprintMechanics,
    RandomGameBlueprintStrategy,
} from "pokie";

function stubStrategy(features: readonly GameMechanicFeature[] = [], name = "stub"): RandomGameBlueprintStrategy {
    return {
        name,
        features,
        build(): RandomGameBlueprintMechanics {
            return {
                reels: 3,
                rows: 3,
                symbols: ["A", "K", "Q"],
                paytable: {A: {"3": 3}, K: {"3": 2}, Q: {"3": 1}},
                symbolWeights: {A: 3, K: 2, Q: 1},
                availableBets: [1],
            };
        },
    };
}

describe("RandomGameBlueprintGenerator", () => {
    test("the same seed always produces the exact same blueprint", () => {
        const first = new RandomGameBlueprintGenerator().generate({seed: 20260721});
        const second = new RandomGameBlueprintGenerator().generate({seed: 20260721});

        expect(second).toEqual(first);
    });

    test("different seeds usually produce different blueprints", () => {
        const generator = new RandomGameBlueprintGenerator();
        const ids = [1, 2, 3, 4, 5].map((seed) => generator.generate({seed}).blueprint.manifest.id);

        expect(new Set(ids).size).toBeGreaterThan(1);
    });

    test("echoes back the seed actually used, including when none was given", () => {
        const {seed} = new RandomGameBlueprintGenerator().generate({seed: 42});
        expect(seed).toBe(42);

        const unseeded = new RandomGameBlueprintGenerator().generate();
        expect(Number.isInteger(unseeded.seed)).toBe(true);
    });

    test("no request at all behaves the same as an empty request", () => {
        const withoutRequest = new RandomGameBlueprintGenerator().generate();
        expect(Number.isInteger(withoutRequest.seed)).toBe(true);
    });

    test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 1000, 999999])(
        "seed %i: produces a blueprint that passes GameBlueprintValidator with zero errors and zero warnings",
        (seed) => {
            const {blueprint} = new RandomGameBlueprintGenerator().generate({seed});

            const issues = new GameBlueprintValidator().validate(blueprint);

            expect(issues).toEqual([]);
        },
    );

    test("reels/rows/symbol count stay within sane, non-suspicious bounds", () => {
        for (let seed = 1; seed <= 50; seed++) {
            const {blueprint} = new RandomGameBlueprintGenerator().generate({seed});

            expect(blueprint.reels).toBeGreaterThanOrEqual(3);
            expect(blueprint.reels).toBeLessThanOrEqual(6);
            expect(blueprint.rows).toBeGreaterThanOrEqual(3);
            expect(blueprint.rows).toBeLessThanOrEqual(4);
            expect(blueprint.symbols.length).toBeGreaterThanOrEqual(5);
            expect(blueprint.symbols.length).toBeLessThanOrEqual(8);
            expect(new Set(blueprint.symbols).size).toBe(blueprint.symbols.length);
        }
    });

    test("every symbol has a paytable entry starting at 3-of-a-kind and a positive reel weight", () => {
        const {blueprint} = new RandomGameBlueprintGenerator().generate({seed: 7});

        for (const symbolId of blueprint.symbols) {
            expect(blueprint.paytable[symbolId]["3"]).toBeGreaterThan(0);
            expect(blueprint.symbolWeights![symbolId]).toBeGreaterThan(0);
        }
    });

    test("uses no mechanics beyond reels/symbols/paytable/symbolWeights (no wilds, scatters, paylines, or bet modes)", () => {
        const {blueprint} = new RandomGameBlueprintGenerator().generate({seed: 13});

        expect(blueprint.wilds).toBeUndefined();
        expect(blueprint.scatters).toBeUndefined();
        expect(blueprint.paylines).toBeUndefined();
        expect(blueprint.winModel).toBeUndefined();
        expect(blueprint.mechanics).toBeUndefined();
        expect(blueprint.betModes).toBeUndefined();
        expect(blueprint.reelStrips).toBeUndefined();
        expect(blueprint.reelStripGeneration).toBeUndefined();
    });

    describe("overrides", () => {
        test("a name override is used verbatim, with an id slugified from it", () => {
            const {blueprint} = new RandomGameBlueprintGenerator().generate({seed: 1, overrides: {name: "My Test Game!"}});

            expect(blueprint.manifest.name).toBe("My Test Game!");
            expect(blueprint.manifest.id).toBe("my-test-game");
        });

        test("an explicit id override wins over the slugified name", () => {
            const {blueprint} = new RandomGameBlueprintGenerator().generate({seed: 1, overrides: {name: "My Game", id: "custom-id"}});

            expect(blueprint.manifest.id).toBe("custom-id");
        });

        test("an override still produces a blueprint that validates cleanly", () => {
            const {blueprint} = new RandomGameBlueprintGenerator().generate({seed: 2, overrides: {name: "Crazy Test Slot"}});

            const issues = new GameBlueprintValidator().validate(blueprint);
            expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
        });
    });

    describe("provenance", () => {
        test("records the generator version, the strategy that produced it, and the seed used", () => {
            const {seed, provenance} = new RandomGameBlueprintGenerator().generate({seed: 99});

            expect(provenance.seed).toBe(seed);
            expect(provenance.strategy).toBe("default-line-pay");
            expect(typeof provenance.generatorVersion).toBe("string");
            expect(provenance.generatorVersion.length).toBeGreaterThan(0);
        });

        test("a custom strategy's name is what gets recorded", () => {
            const {provenance} = new RandomGameBlueprintGenerator(undefined, stubStrategy([], "my-strategy")).generate({seed: 1});

            expect(provenance.strategy).toBe("my-strategy");
        });
    });

    describe("strategy/compatibility policy", () => {
        test("a strategy with no declared mechanic features is accepted by the default policy", () => {
            expect(() => new RandomGameBlueprintGenerator(undefined, stubStrategy([]))).not.toThrow();
        });

        test("a strategy that declares an optional mechanic feature is rejected by the default policy", () => {
            expect(() => new RandomGameBlueprintGenerator(undefined, stubStrategy(["wilds"]))).toThrow(/incompatible/);
        });

        test("a permissive custom compatibility policy allows a strategy the default policy would reject", () => {
            const permissivePolicy = {isCompatible: () => true};
            expect(() => new RandomGameBlueprintGenerator(undefined, stubStrategy(["wilds"]), permissivePolicy)).not.toThrow();
        });

        test("a custom strategy's mechanics end up on the generated blueprint", () => {
            const {blueprint} = new RandomGameBlueprintGenerator(undefined, stubStrategy()).generate({seed: 5});

            expect(blueprint.reels).toBe(3);
            expect(blueprint.symbols).toEqual(["A", "K", "Q"]);
        });

        test("DefaultGameMechanicCompatibilityPolicy rejects any non-empty feature set", () => {
            const policy = new DefaultGameMechanicCompatibilityPolicy();

            expect(policy.isCompatible([])).toBe(true);
            expect(policy.isCompatible(["wilds"])).toBe(false);
        });
    });
});
