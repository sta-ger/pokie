import {
    describePayoutHistogramBucket,
    describePayoutHistogramBuckets,
    payoutHistogramBar,
    payoutHistogramRows,
} from "../../src/reporting/payoutHistogramPresentation.js";

describe("payout histogram presentation", () => {
    it("orders known buckets and computes shares from the total", () => {
        const rows = payoutHistogramRows({"100+": 1, "1-9": 30, "0": 60, "10-99": 9});
        expect(rows.map(row => row.bucket)).toEqual(["0", "1-9", "10-99", "100+"]);
        expect(rows.map(row => row.rounds)).toEqual([60, 30, 9, 1]);
        expect(rows[0]!.share).toBeCloseTo(0.6);
        expect(rows[3]!.share).toBeCloseTo(0.01);
        expect(rows[0]!.label).toBe("0 (no win)");
        expect(rows[1]!.label).toBe("1–9 (legacy)");
    });

    it("names every new bucket with the exact half-open interval", () => {
        expect(describePayoutHistogramBucket("0-1")).toBe("(0, 1)");
        expect(describePayoutHistogramBucket("1-2")).toBe("[1, 2)");
        expect(describePayoutHistogramBucket("2-5")).toBe("[2, 5)");
        expect(describePayoutHistogramBucket("5-10")).toBe("[5, 10)");
        expect(describePayoutHistogramBucket("10-25")).toBe("[10, 25)");
        expect(describePayoutHistogramBucket("25-50")).toBe("[25, 50)");
        expect(describePayoutHistogramBucket("50-100")).toBe("[50, 100)");
        expect(describePayoutHistogramBucket("100-250")).toBe("[100, 250)");
        expect(describePayoutHistogramBucket("250-500")).toBe("[250, 500)");
        expect(describePayoutHistogramBucket("500-1000")).toBe("[500, 1,000)");
        expect(describePayoutHistogramBucket("1000+")).toBe("[1,000, ∞)");
    });

    it("describes the actual buckets present instead of a stale hard-coded set", () => {
        expect(describePayoutHistogramBuckets({"0": 75, "1-2": 20, "2-5": 5}))
            .toBe("0 (no win)=75; [1, 2)=20; [2, 5)=5");
        expect(describePayoutHistogramBuckets(undefined)).toBe("none");
    });

    it("keeps unknown buckets after the known ones and tolerates an empty histogram", () => {
        expect(payoutHistogramRows({"custom": 2, "0": 2}).map(row => row.label)).toEqual(["0 (no win)", "custom"]);
        expect(payoutHistogramRows(undefined)).toEqual([]);
        expect(payoutHistogramRows({})).toEqual([]);
    });

    it("renders a bounded text bar", () => {
        expect(payoutHistogramBar(0, 4)).toBe("····");
        expect(payoutHistogramBar(1, 4)).toBe("████");
        expect(payoutHistogramBar(0.5, 4)).toBe("██··");
        expect(payoutHistogramBar(Number.NaN, 4)).toBe("····");
    });
});
