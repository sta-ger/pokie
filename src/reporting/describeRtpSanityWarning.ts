// A deliberately non-certifying sanity hint for the authoring UI. It never decides whether a design is
// shippable; it only points out RTP values that are far outside the usual range so a typo in a paytable
// or a feature award is easier to notice. The thresholds are intentionally broad: 0.9 and 1.0. A value
// below 90% is already unusual for a commercial slot and is almost always a paytable/feature mistake,
// while values at or above 90% remain plausible for niche or intentionally harsh designs.
//
// A sampled report can also look unusual purely because the sample is small. When the caller supplies
// the sample size (and optionally its interval), say so explicitly instead of letting a 10,000-spin
// estimate read like a design verdict. Exact-math callers pass no sample and keep the short warning.
export type RtpSanitySample = {
    readonly rounds?: number;
    readonly confidenceInterval95?: {readonly low: number; readonly high: number};
};

export function describeRtpSanityWarning(rtp: number, sample?: RtpSanitySample): string | undefined {
    if (!Number.isFinite(rtp)) return undefined;
    let message: string | undefined;
    if (rtp > 1) {
        message = "RTP is above 100%: over the long run players would profit. Check paytable values and feature awards before treating this as finished.";
    } else if (rtp < 0.9) {
        message = "RTP is below 90%: unusually low for a slot game. Check the paytable, reel weights and feature awards.";
    }
    if (message === undefined) return undefined;
    if (sample?.rounds !== undefined && sample.rounds < 50_000) {
        const interval = sample.confidenceInterval95;
        const intervalText = interval === undefined
            ? ""
            : ` The 95% interval is ${(interval.low * 100).toFixed(2)}%–${(interval.high * 100).toFixed(2)}%.`;
        return `${message}${intervalText} This sample has ${sample.rounds.toLocaleString("en-US")} paid rounds; use exact math or a larger run before treating the number as a design verdict.`;
    }
    return message;
}
