import {PseudorandomNumberGenerator, SecureRandomNumberGenerator, SeededRandomNumberGenerator} from "pokie";

describe("PseudorandomNumberGenerator", () => {
    test("getRandomNumber should return a number between 0 and 1", () => {
        const generator = new PseudorandomNumberGenerator();
        const randomNumber = generator.getRandomInt(0, 10);
        expect(randomNumber).toBeGreaterThanOrEqual(0);
        expect(randomNumber).toBeLessThanOrEqual(10);
    });
});

describe("SecureRandomNumberGenerator", () => {
    test("getRandomNumber should return a number between 0 and 1", () => {
        const generator = new SecureRandomNumberGenerator();
        const randomNumber = generator.getRandomInt(0, 10);
        expect(randomNumber).toBeGreaterThanOrEqual(0);
        expect(randomNumber).toBeLessThanOrEqual(10);
    });
});

describe("SeededRandomNumberGenerator", () => {
    test("stays within the requested [min, max) range", () => {
        const generator = new SeededRandomNumberGenerator(12345);
        for (let i = 0; i < 1000; i++) {
            const randomNumber = generator.getRandomInt(0, 10);
            expect(randomNumber).toBeGreaterThanOrEqual(0);
            expect(randomNumber).toBeLessThan(10);
        }
    });

    test("the same seed always produces the same sequence of draws", () => {
        const drawsFrom = (seed: number): number[] => {
            const generator = new SeededRandomNumberGenerator(seed);
            return new Array(20).fill(0).map(() => generator.getRandomInt(0, 1000));
        };

        expect(drawsFrom(42)).toEqual(drawsFrom(42));
        expect(drawsFrom(42)).not.toEqual(drawsFrom(43));
    });

    test("different seeds produce different sequences across a range of nearby seed values", () => {
        const drawsFrom = (seed: number): number[] => {
            const generator = new SeededRandomNumberGenerator(seed);
            return new Array(10).fill(0).map(() => generator.getRandomInt(0, 1_000_000));
        };

        const sequences = [1, 2, 3, 4, 5].map(drawsFrom);
        const unique = new Set(sequences.map((sequence) => JSON.stringify(sequence)));
        expect(unique.size).toBe(sequences.length);
    });

    test("seed 0 and negative seeds are handled without throwing and remain reproducible", () => {
        expect(() => new SeededRandomNumberGenerator(0).getRandomInt(0, 10)).not.toThrow();
        expect(() => new SeededRandomNumberGenerator(-1).getRandomInt(0, 10)).not.toThrow();

        const drawsFrom = (seed: number): number[] => {
            const generator = new SeededRandomNumberGenerator(seed);
            return new Array(10).fill(0).map(() => generator.getRandomInt(0, 1000));
        };

        expect(drawsFrom(0)).toEqual(drawsFrom(0));
        expect(drawsFrom(-1)).toEqual(drawsFrom(-1));
    });

    test("is suitable as a drop-in deterministic replacement in repeated test runs", () => {
        // simulates the pattern a regression/golden test would use: construct fresh each time,
        // draw a sequence, and expect byte-for-byte reproducibility across "test runs".
        const runOnce = (): number[] => {
            const generator = new SeededRandomNumberGenerator(2024);
            return new Array(5).fill(0).map(() => generator.getRandomInt(0, 50));
        };

        const firstRun = runOnce();
        const secondRun = runOnce();
        const thirdRun = runOnce();

        expect(firstRun).toEqual(secondRun);
        expect(secondRun).toEqual(thirdRun);
    });
});
