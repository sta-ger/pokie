// Simulation recommendations are authored by the core report builder and are also rendered by the CLI,
// so they describe terminal flags. Studio has equivalent controls; translate the known CLI phrasing at
// the browser boundary without changing the persisted report text.
// A simulation's own 95% interval tells the reader how noisy the sample is. A math author usually
// wants to know how many rounds a tighter interval would need, not just that the current one is wide.
// Uses the same normal approximation as the interval itself, so this stays a planning estimate derived
// from the report rather than a second statistical model. The interval and target are proportions
// (0.01 = one percentage point), matching the report view.
export function roundsForRtpHalfWidth(
    rounds: number,
    interval: {low: number; high: number},
    targetHalfWidth: number,
): number | undefined {
    if (!Number.isFinite(rounds) || rounds <= 0) return undefined;
    if (!Number.isFinite(interval.low) || !Number.isFinite(interval.high) || interval.high <= interval.low) return undefined;
    if (!Number.isFinite(targetHalfWidth) || targetHalfWidth <= 0) return undefined;
    const observedHalfWidth = (interval.high - interval.low) / 2;
    if (observedHalfWidth <= targetHalfWidth) return Math.ceil(rounds);
    return Math.ceil(rounds * (observedHalfWidth / targetHalfWidth) ** 2);
}

// The estimate is a planning aid, not a promise: keep three significant digits rather than echoing
// a floating-point floor as if the exact required round count were known.
export function formatRoundsEstimate(rounds: number): string {
    return rounds.toLocaleString("en-US", {maximumSignificantDigits: 3});
}

export function describeStudioSimulationRecommendation(recommendation: string): string {
    if (recommendation.startsWith("Run with --seed")) {
        return "Set a seed under Advanced details before running to make this simulation reproducible.";
    }
    if (recommendation.startsWith("Increase --rounds")) {
        return recommendation.replace("Increase --rounds", "Increase Rounds");
    }
    if (recommendation.startsWith('Use "pokie diff"')) {
        return "Use Compare with another run to compare this report against another saved run after changing the game's math.";
    }
    if (recommendation.startsWith("Save this report as JSON via --out")) {
        return "Use Export → Download JSON to keep a record you can diff or replay against later.";
    }
    return recommendation;
}
