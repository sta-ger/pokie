import {payoutHistogramBar, payoutHistogramRows} from "../../src/reporting/payoutHistogramPresentation.js";

describe("payout histogram presentation", () => {
    it("orders known buckets and computes shares from the total", () => {
        const rows = payoutHistogramRows({"100+": 1, "1-9": 30, "0": 60, "10-99": 9});
        expect(rows.map(row => row.bucket)).toEqual(["0", "1-9", "10-99", "100+"]);
        expect(rows.map(row => row.rounds)).toEqual([60, 30, 9, 1]);
        expect(rows[0]!.share).toBeCloseTo(0.6);
        expect(rows[3]!.share).toBeCloseTo(0.01);
        expect(rows[0]!.label).toBe("0 (no win)");
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
