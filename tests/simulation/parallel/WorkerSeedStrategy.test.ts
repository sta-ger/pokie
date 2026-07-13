import {WorkerSeedStrategy} from "pokie";

describe("WorkerSeedStrategy", () => {
    describe("deriveSeed", () => {
        test("undefined seed stays undefined regardless of worker count (unseeded run)", () => {
            expect(WorkerSeedStrategy.deriveSeed(undefined, 0, 1)).toBeUndefined();
            expect(WorkerSeedStrategy.deriveSeed(undefined, 2, 4)).toBeUndefined();
        });

        test("workers=1 is the identity case: the single worker gets the original seed unchanged", () => {
            expect(WorkerSeedStrategy.deriveSeed("demo", 0, 1)).toBe("demo");
        });

        test("workers>1 derives a distinct seed per worker index", () => {
            const seeds = [0, 1, 2, 3].map((index) => WorkerSeedStrategy.deriveSeed("demo", index, 4));

            expect(new Set(seeds).size).toBe(4);
            seeds.forEach((seed) => expect(seed).not.toBe("demo"));
        });

        test("is deterministic: the same (seed, index, totalWorkers) always derives the same seed", () => {
            expect(WorkerSeedStrategy.deriveSeed("demo", 2, 4)).toBe(WorkerSeedStrategy.deriveSeed("demo", 2, 4));
        });

        test("derivation is sensitive to totalWorkers, not just index (different --workers means different streams)", () => {
            const withFourWorkers = WorkerSeedStrategy.deriveSeed("demo", 1, 4);
            const withTwoWorkers = WorkerSeedStrategy.deriveSeed("demo", 1, 2);

            expect(withFourWorkers).not.toBe(withTwoWorkers);
        });
    });

    describe("describe", () => {
        test("describes an unseeded run", () => {
            expect(WorkerSeedStrategy.describe(undefined, 4)).toMatch(/unseeded/i);
        });

        test("describes the workers=1 identity case", () => {
            expect(WorkerSeedStrategy.describe("demo", 1)).toMatch(/identity/i);
        });

        test("describes the workers>1 derivation", () => {
            expect(WorkerSeedStrategy.describe("demo", 4)).toMatch(/deterministic/i);
        });
    });
});
