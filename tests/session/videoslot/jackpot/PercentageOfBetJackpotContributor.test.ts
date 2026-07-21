import {PercentageOfBetJackpotContributor} from "pokie";

describe("PercentageOfBetJackpotContributor", () => {
    it("contributes the configured percentage of the stake, regardless of poolId", () => {
        const contributor = new PercentageOfBetJackpotContributor(0.01);

        expect(contributor.computeContribution("mini", 100)).toBe(1);
        expect(contributor.computeContribution("grand", 100)).toBe(1);
    });

    it("contributes 0 for a 0% rate", () => {
        const contributor = new PercentageOfBetJackpotContributor(0);
        expect(contributor.computeContribution("mini", 100)).toBe(0);
    });

    it("rejects a negative percentage", () => {
        expect(() => new PercentageOfBetJackpotContributor(-0.01)).toThrow(/finite number >= 0/);
    });

    it("rejects a non-finite percentage", () => {
        expect(() => new PercentageOfBetJackpotContributor(Infinity)).toThrow(/finite number >= 0/);
        expect(() => new PercentageOfBetJackpotContributor(NaN)).toThrow(/finite number >= 0/);
    });
});
