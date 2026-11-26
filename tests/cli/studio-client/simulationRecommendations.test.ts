import {describeStudioSimulationRecommendation, formatRoundsEstimate, paidRoundsForRtpHalfWidthFromSigma, requestedPlaysForRtpHalfWidth, roundsForRtpHalfWidth} from "../../../cli/studio-client/src/domain/simulationRecommendations.js";

describe("describeStudioSimulationRecommendation", () => {
    it("maps terminal seed advice to the Studio control", () => {
        expect(describeStudioSimulationRecommendation("Run with --seed <seed> (e.g. --seed demo) to make this simulation reproducible."))
            .toBe("Set a seed under Advanced details before running to make this simulation reproducible.");
    });

    it("maps round-count and comparison/export advice without leaving CLI flags", () => {
        expect(describeStudioSimulationRecommendation("Increase --rounds (e.g. 10000+) for more stable RTP/hit-frequency estimates."))
            .toBe("Increase Plays (e.g. 10000+) for more stable RTP/hit-frequency estimates.");
        expect(describeStudioSimulationRecommendation('Use "pokie diff" to compare this report against a previous run after changing the game\'s math.'))
            .toMatch(/Compare with another run/);
        expect(describeStudioSimulationRecommendation("Save this report as JSON via --out to keep a record you can diff or replay against later."))
            .toBe("Use Export → Download JSON to keep a record you can diff or replay against later.");
    });

    it("leaves unrelated recommendations untouched", () => {
        expect(describeStudioSimulationRecommendation("A future recommendation.")).toBe("A future recommendation.");
    });
});

describe("roundsForRtpHalfWidth", () => {
    it("estimates the rounds a tighter RTP interval needs from the observed sample", () => {
        expect(roundsForRtpHalfWidth(10_000, {low: 0.9169, high: 1.0275}, 0.01)).toBe(305_810);
        const halfPoint = roundsForRtpHalfWidth(10_000, {low: 0.9169, high: 1.0275}, 0.005);
        expect(halfPoint).toBeGreaterThanOrEqual(1_223_000);
        expect(halfPoint).toBeLessThanOrEqual(1_224_000);
    });

    it("formats planning estimates without false precision", () => {
        expect(formatRoundsEstimate(305_810)).toBe("306,000");
        expect(formatRoundsEstimate(1_223_236)).toBe("1,220,000");
    });

    it("does not ask for more rounds when the current interval already meets the target", () => {
        expect(roundsForRtpHalfWidth(10_000, {low: 0.99, high: 1.0}, 0.01)).toBe(10_000);
    });

    it("translates required paid rounds into the play budget when free games expand each paid round", () => {
        expect(requestedPlaysForRtpHalfWidth(10_000, 14_500, {low: 0.9169, high: 1.0275}, 0.01)).toBe(443_425);
        expect(requestedPlaysForRtpHalfWidth(10_000, 10_000, {low: 0.9169, high: 1.0275}, 0.01)).toBe(305_810);
        expect(requestedPlaysForRtpHalfWidth(10_000, 0, {low: 0.9169, high: 1.0275}, 0.01)).toBeUndefined();
    });

    it("returns no estimate for an invalid interval or target", () => {
        expect(roundsForRtpHalfWidth(0, {low: 0.9, high: 1.1}, 0.01)).toBeUndefined();
        expect(roundsForRtpHalfWidth(100, {low: 1.1, high: 0.9}, 0.01)).toBeUndefined();
        expect(roundsForRtpHalfWidth(100, {low: 0.9, high: 1.1}, 0)).toBeUndefined();
    });
});

describe("paidRoundsForRtpHalfWidthFromSigma", () => {
    it("estimates a pre-run budget from exact-math volatility", () => {
        const rounds = paidRoundsForRtpHalfWidthFromSigma(2.8149, 0.01);
        expect(rounds).toBeGreaterThan(300_000);
        expect(rounds).toBeLessThan(310_000);
        expect(paidRoundsForRtpHalfWidthFromSigma(2.8149, 0.005)).toBeGreaterThan(1_200_000);
    });

    it("returns no estimate for invalid inputs", () => {
        expect(paidRoundsForRtpHalfWidthFromSigma(0, 0.01)).toBeUndefined();
        expect(paidRoundsForRtpHalfWidthFromSigma(2.8, 0)).toBeUndefined();
        expect(paidRoundsForRtpHalfWidthFromSigma(Number.NaN, 0.01)).toBeUndefined();
    });
});
