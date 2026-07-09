import {PseudorandomNumberGenerator, SecureRandomNumberGenerator} from "pokie";

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
