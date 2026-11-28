import {estimateFullOutcomeBuildDuration, estimateOutcomeGenerationDuration} from "@fromstan/pokie";

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

describe("estimateFullOutcomeBuildDuration", () => {
    it("keeps the full-build upper bound separate from raw enumeration", () => {
        expect(estimateFullOutcomeBuildDuration(BigInt(200))).toBe("less than a second");
        expect(estimateFullOutcomeBuildDuration(BigInt(4_000))).toBe("about 10 second(s)");
        expect(estimateFullOutcomeBuildDuration(BigInt(120_000))).toBe("about 5 minute(s)");
        expect(estimateFullOutcomeBuildDuration(BigInt(2_476_099))).toBe("about 2 hour(s)");
        expect(estimateFullOutcomeBuildDuration(BigInt(20_000_000))).toBe("about 14 hour(s)");
    });
});
