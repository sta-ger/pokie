import {estimateOutcomeGenerationDuration} from "@fromstan/pokie";

describe("estimateOutcomeGenerationDuration", () => {
    it("reports a short run without inventing precision", () => {
        expect(estimateOutcomeGenerationDuration(BigInt(500))).toBe("less than a second");
        expect(estimateOutcomeGenerationDuration(BigInt(4_000))).toBe("about 2 second(s)");
    });

    it("scales into minutes and hours for large exact spaces", () => {
        expect(estimateOutcomeGenerationDuration(BigInt(120_000))).toBe("about 1 minute(s)");
        expect(estimateOutcomeGenerationDuration(BigInt(2_476_099))).toBe("about 21 minute(s)");
        expect(estimateOutcomeGenerationDuration(BigInt(20_000_000))).toBe("about 3 hour(s)");
    });
});
