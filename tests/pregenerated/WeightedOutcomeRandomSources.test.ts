import {SecureWeightedOutcomeRandomSource, SeededWeightedOutcomeRandomSource} from "pokie";

describe("SeededWeightedOutcomeRandomSource", () => {
    it("always returns an integer in [0, exclusiveUpperBound)", () => {
        const source = new SeededWeightedOutcomeRandomSource("seed-1");
        for (let i = 0; i < 2000; i++) {
            const value = source.nextInt(100);
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(100);
        }
    });

    it("produces the exact same sequence for the same string seed", () => {
        const drawSequence = (seed: string): number[] => {
            const source = new SeededWeightedOutcomeRandomSource(seed);
            return Array.from({length: 20}, () => source.nextInt(1000));
        };

        expect(drawSequence("seed-777")).toEqual(drawSequence("seed-777"));
    });

    it("produces different sequences for different seeds", () => {
        const drawSequence = (seed: string): number[] => {
            const source = new SeededWeightedOutcomeRandomSource(seed);
            return Array.from({length: 5}, () => source.nextInt(1000000));
        };

        expect(drawSequence("seed-1")).not.toEqual(drawSequence("seed-2"));
    });

    it("uses the seed in full — two seeds differing only past the first 32 bits worth of characters still diverge", () => {
        // A 32-bit fold-down of the seed (the previous design) would have been unable to distinguish
        // seeds this similar reliably; the full-seed hash-counter stream must.
        const longPrefix = "a".repeat(64);
        const drawSequence = (seed: string): number[] => {
            const source = new SeededWeightedOutcomeRandomSource(seed);
            return Array.from({length: 5}, () => source.nextInt(1000000));
        };

        expect(drawSequence(`${longPrefix}-x`)).not.toEqual(drawSequence(`${longPrefix}-y`));
    });

    it("draws every value in a small range with roughly equal frequency (no modulo bias)", () => {
        const source = new SeededWeightedOutcomeRandomSource("seed-42");
        const counts = [0, 0, 0];
        const samples = 30000;
        for (let i = 0; i < samples; i++) {
            counts[source.nextInt(3)]++;
        }

        counts.forEach((count) => {
            expect(count / samples).toBeGreaterThan(0.3);
            expect(count / samples).toBeLessThan(0.37);
        });
    });

    it("supports a range spanning the full safe-integer space, and actually reaches points above 2^32", () => {
        const source = new SeededWeightedOutcomeRandomSource("seed-1");
        let sawAboveThirtyTwoBits = false;
        for (let i = 0; i < 200; i++) {
            const value = source.nextInt(Number.MAX_SAFE_INTEGER);
            expect(Number.isSafeInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(Number.MAX_SAFE_INTEGER);
            if (value >= 2 ** 32) {
                sawAboveThirtyTwoBits = true;
            }
        }
        expect(sawAboveThirtyTwoBits).toBe(true);
    });

    it("returns 0 for an exclusiveUpperBound of 1", () => {
        const source = new SeededWeightedOutcomeRandomSource("seed-1");
        expect(source.nextInt(1)).toBe(0);
    });

    it("rejects a non-positive or non-safe-integer exclusiveUpperBound", () => {
        const source = new SeededWeightedOutcomeRandomSource("seed-1");
        expect(() => source.nextInt(0)).toThrow(RangeError);
        expect(() => source.nextInt(-1)).toThrow(RangeError);
        expect(() => source.nextInt(1.5)).toThrow(RangeError);
        expect(() => source.nextInt(Number.MAX_SAFE_INTEGER + 10)).toThrow(RangeError);
    });
});

describe("SecureWeightedOutcomeRandomSource", () => {
    it("always returns an integer in [0, exclusiveUpperBound)", () => {
        const source = new SecureWeightedOutcomeRandomSource();
        for (let i = 0; i < 200; i++) {
            const value = source.nextInt(100);
            expect(Number.isInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(100);
        }
    });

    it("supports a bound above crypto.randomInt's own 2^48 limit", () => {
        const source = new SecureWeightedOutcomeRandomSource();
        const bound = 2 ** 48 + 12345;
        for (let i = 0; i < 100; i++) {
            const value = source.nextInt(bound);
            expect(Number.isSafeInteger(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(bound);
        }
    });

    it("supports a range spanning the full safe-integer space", () => {
        const source = new SecureWeightedOutcomeRandomSource();
        const value = source.nextInt(Number.MAX_SAFE_INTEGER);
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(Number.MAX_SAFE_INTEGER);
    });

    it("rejects a non-positive or non-safe-integer exclusiveUpperBound", () => {
        const source = new SecureWeightedOutcomeRandomSource();
        expect(() => source.nextInt(0)).toThrow(RangeError);
        expect(() => source.nextInt(-1)).toThrow(RangeError);
        expect(() => source.nextInt(Number.MAX_SAFE_INTEGER + 10)).toThrow(RangeError);
    });
});
