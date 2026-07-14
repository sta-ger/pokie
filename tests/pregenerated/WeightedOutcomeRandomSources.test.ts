import {SecureWeightedOutcomeRandomSource, SeededWeightedOutcomeRandomSource} from "pokie";

describe("SeededWeightedOutcomeRandomSource", () => {
    it("always returns a finite value in [0, 1)", () => {
        const source = new SeededWeightedOutcomeRandomSource(1);
        for (let i = 0; i < 1000; i++) {
            const value = source.nextUnitInterval();
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });

    it("produces the exact same sequence for the same seed", () => {
        const drawSequence = (seed: number): number[] => {
            const source = new SeededWeightedOutcomeRandomSource(seed);
            return Array.from({length: 20}, () => source.nextUnitInterval());
        };

        expect(drawSequence(777)).toEqual(drawSequence(777));
    });

    it("produces different sequences for different seeds", () => {
        const drawSequence = (seed: number): number[] => {
            const source = new SeededWeightedOutcomeRandomSource(seed);
            return Array.from({length: 5}, () => source.nextUnitInterval());
        };

        expect(drawSequence(1)).not.toEqual(drawSequence(2));
    });
});

describe("SecureWeightedOutcomeRandomSource", () => {
    it("always returns a finite value in [0, 1)", () => {
        const source = new SecureWeightedOutcomeRandomSource();
        for (let i = 0; i < 200; i++) {
            const value = source.nextUnitInterval();
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });
});
