import {describeRtpSanityWarning} from "../../src/reporting/describeRtpSanityWarning.js";

describe("describeRtpSanityWarning", () => {
    it("flags an RTP above 100%", () => {
        expect(describeRtpSanityWarning(1.00608)).toContain("above 100%");
    });

    it("flags an RTP below 90%", () => {
        expect(describeRtpSanityWarning(0.2692)).toContain("below 90%");
        expect(describeRtpSanityWarning(0.84)).toContain("below 90%");
    });

    it("does not flag a usual RTP", () => {
        expect(describeRtpSanityWarning(0.96768)).toBeUndefined();
        expect(describeRtpSanityWarning(1)).toBeUndefined();
        expect(describeRtpSanityWarning(0.9)).toBeUndefined();
    });

    it("qualifies a small-sample warning with the interval and a safer next check", () => {
        const warning = describeRtpSanityWarning(0.84, {
            rounds: 10_000,
            confidenceInterval95: {low: 0.8, high: 0.88},
        });
        expect(warning).toContain("below 90%");
        expect(warning).toContain("The 95% interval is 80.00%–88.00%.");
        expect(warning).toContain("This sample has 10,000 paid rounds");
        expect(warning).toContain("use exact math or a larger run");
    });

    it("does not add the small-sample qualifier for a large run or no context", () => {
        const large = describeRtpSanityWarning(1.02, {rounds: 100_000});
        expect(large).toContain("above 100%");
        expect(large).not.toContain("This sample has");
        expect(describeRtpSanityWarning(1.02)).toBe(
            "RTP is above 100%: over the long run players would profit. Check paytable values and feature awards before treating this as finished.",
        );
    });

    it("ignores non-finite values", () => {
        expect(describeRtpSanityWarning(Number.NaN)).toBeUndefined();
        expect(describeRtpSanityWarning(Number.POSITIVE_INFINITY)).toBeUndefined();
    });
});
