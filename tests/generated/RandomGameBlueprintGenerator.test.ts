import {GameBlueprintValidator, RandomGameBlueprintGenerator} from "pokie";

describe("RandomGameBlueprintGenerator", () => {
    test("the same seed always produces the exact same blueprint", () => {
        const first = new RandomGameBlueprintGenerator().generate(20260721);
        const second = new RandomGameBlueprintGenerator().generate(20260721);

        expect(second).toEqual(first);
    });

    test("different seeds usually produce different blueprints", () => {
        const generator = new RandomGameBlueprintGenerator();
        const ids = [1, 2, 3, 4, 5].map((seed) => generator.generate(seed).blueprint.manifest.id);

        expect(new Set(ids).size).toBeGreaterThan(1);
    });

    test("echoes back the seed actually used, including when none was given", () => {
        const {seed} = new RandomGameBlueprintGenerator().generate(42);
        expect(seed).toBe(42);

        const unseeded = new RandomGameBlueprintGenerator().generate();
        expect(Number.isInteger(unseeded.seed)).toBe(true);
    });

    test.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 42, 1000, 999999])(
        "seed %i: produces a blueprint that passes GameBlueprintValidator with zero errors and zero warnings",
        (seed) => {
            const {blueprint} = new RandomGameBlueprintGenerator().generate(seed);

            const issues = new GameBlueprintValidator().validate(blueprint);

            expect(issues).toEqual([]);
        },
    );

    test("reels/rows/symbol count stay within sane, non-suspicious bounds", () => {
        for (let seed = 1; seed <= 50; seed++) {
            const {blueprint} = new RandomGameBlueprintGenerator().generate(seed);

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
        const {blueprint} = new RandomGameBlueprintGenerator().generate(7);

        for (const symbolId of blueprint.symbols) {
            expect(blueprint.paytable[symbolId]["3"]).toBeGreaterThan(0);
            expect(blueprint.symbolWeights![symbolId]).toBeGreaterThan(0);
        }
    });

    test("uses no mechanics beyond reels/symbols/paytable/symbolWeights (no wilds, scatters, paylines, or bet modes)", () => {
        const {blueprint} = new RandomGameBlueprintGenerator().generate(13);

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
            const {blueprint} = new RandomGameBlueprintGenerator().generate(1, {name: "My Test Game!"});

            expect(blueprint.manifest.name).toBe("My Test Game!");
            expect(blueprint.manifest.id).toBe("my-test-game");
        });

        test("an explicit id override wins over the slugified name", () => {
            const {blueprint} = new RandomGameBlueprintGenerator().generate(1, {name: "My Game", id: "custom-id"});

            expect(blueprint.manifest.id).toBe("custom-id");
        });

        test("an override still produces a blueprint that validates cleanly", () => {
            const {blueprint} = new RandomGameBlueprintGenerator().generate(2, {name: "Crazy Test Slot"});

            const issues = new GameBlueprintValidator().validate(blueprint);
            expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
        });
    });
});
