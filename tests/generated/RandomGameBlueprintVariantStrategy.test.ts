import {
    DefaultGameMechanicCompatibilityPolicy,
    GameBlueprintValidator,
    RandomGameBlueprintGenerator,
    RandomGameBlueprintVariantStrategy,
} from "pokie";

const SEEDS = Array.from({length: 60}, (_, index) => index + 1);

function generateAll() {
    const generator = new RandomGameBlueprintGenerator(undefined, new RandomGameBlueprintVariantStrategy());
    return SEEDS.map((seed) => generator.generate({seed}));
}

describe("RandomGameBlueprintVariantStrategy", () => {
    test("its declared features are accepted by the default compatibility policy", () => {
        const strategy = new RandomGameBlueprintVariantStrategy();
        const policy = new DefaultGameMechanicCompatibilityPolicy();

        expect(policy.isCompatible(strategy.features)).toBe(true);
        expect(() => new RandomGameBlueprintGenerator(undefined, strategy)).not.toThrow();
    });

    test("the same seed always produces the exact same blueprint", () => {
        const strategy = new RandomGameBlueprintVariantStrategy();
        const first = new RandomGameBlueprintGenerator(undefined, strategy).generate({seed: 20260725});
        const second = new RandomGameBlueprintGenerator(undefined, new RandomGameBlueprintVariantStrategy()).generate({
            seed: 20260725,
        });

        expect(second).toEqual(first);
    });

    test.each(SEEDS)("seed %i: produces a blueprint that passes GameBlueprintValidator with zero errors and zero warnings", (seed) => {
        const {blueprint} = new RandomGameBlueprintGenerator(undefined, new RandomGameBlueprintVariantStrategy()).generate({
            seed,
        });

        const issues = new GameBlueprintValidator().validate(blueprint);

        expect(issues).toEqual([]);
    });

    test("never sets both paylines and winModel on the same blueprint", () => {
        for (const {blueprint} of generateAll()) {
            expect(blueprint.paylines !== undefined && blueprint.winModel !== undefined).toBe(false);
        }
    });

    test("sets exactly one of symbolWeights/reelStrips, never both, never neither", () => {
        for (const {blueprint} of generateAll()) {
            const hasWeights = blueprint.symbolWeights !== undefined;
            const hasStrips = blueprint.reelStrips !== undefined;
            expect(hasWeights !== hasStrips).toBe(true);
        }
    });

    test("across many seeds, exercises every supported win shape (default lines, paylines, ways, clusters)", () => {
        const shapes = generateAll().map(({blueprint}) => {
            if (blueprint.paylines !== undefined) {
                return "paylines";
            }
            if (blueprint.winModel?.type === "ways") {
                return "ways";
            }
            if (blueprint.winModel?.type === "clusters") {
                return "clusters";
            }
            return "lines";
        });

        expect(new Set(shapes)).toEqual(new Set(["lines", "paylines", "ways", "clusters"]));
    });

    test("across many seeds, exercises both symbolWeights and reelStrips", () => {
        const usesReelStrips = generateAll().map(({blueprint}) => blueprint.reelStrips !== undefined);

        expect(usesReelStrips).toContain(true);
        expect(usesReelStrips).toContain(false);
    });

    test("across many seeds, exercises more than one bet ladder", () => {
        const betLadders = new Set(generateAll().map(({blueprint}) => JSON.stringify(blueprint.availableBets)));

        expect(betLadders.size).toBeGreaterThan(1);
    });

    test("a clusters blueprint's paytable match-counts never exceed reels * rows", () => {
        for (const {blueprint} of generateAll()) {
            if (blueprint.winModel?.type !== "clusters") {
                continue;
            }
            const maxMatchCount = blueprint.reels * blueprint.rows;
            for (const payouts of Object.values(blueprint.paytable)) {
                for (const times of Object.keys(payouts)) {
                    expect(Number(times)).toBeLessThanOrEqual(maxMatchCount);
                }
            }
        }
    });

    test("a lines/ways/paylines blueprint's paytable match-counts never exceed reels", () => {
        for (const {blueprint} of generateAll()) {
            if (blueprint.winModel?.type === "clusters") {
                continue;
            }
            for (const payouts of Object.values(blueprint.paytable)) {
                for (const times of Object.keys(payouts)) {
                    expect(Number(times)).toBeLessThanOrEqual(blueprint.reels);
                }
            }
        }
    });

    test("paylines, when present, are all distinct and structurally valid", () => {
        for (const {blueprint} of generateAll()) {
            if (blueprint.paylines === undefined) {
                continue;
            }
            const keys = blueprint.paylines.map((line) => JSON.stringify(line));
            expect(new Set(keys).size).toBe(blueprint.paylines.length);
            for (const line of blueprint.paylines) {
                expect(line.length).toBe(blueprint.reels);
                for (const row of line) {
                    expect(row).toBeGreaterThanOrEqual(0);
                    expect(row).toBeLessThan(blueprint.rows);
                }
            }
        }
    });

    test("provenance records this strategy's name", () => {
        const {provenance} = new RandomGameBlueprintGenerator(undefined, new RandomGameBlueprintVariantStrategy()).generate({
            seed: 5,
        });

        expect(provenance.strategy).toBe("random-variant");
    });
});
