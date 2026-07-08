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
});
