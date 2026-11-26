// Simulation recommendations are authored by the core builder for both the CLI and saved reports, so
// they legitimately mention terminal flags. Rendered math reports are read by game-math authors who
// may never open a terminal; translate the known command-line advice at the report-rendering boundary
// instead of changing the persisted recommendation text.
export function describeMathFacingRecommendation(recommendation: string): string {
    if (recommendation.startsWith("Run with --seed")) {
        return "Set a seed if you need to reproduce this run later.";
    }
    if (recommendation.startsWith("Increase --rounds")) {
        return "Run more paid rounds if you need a narrower RTP confidence interval.";
    }
    if (recommendation.startsWith('Use "pokie diff"')) {
        return "Compare this sample with another run after changing the game's math.";
    }
    if (recommendation.startsWith("Save this report as JSON via --out")) {
        return "Keep the JSON export with this report if you need to re-analyse it later.";
    }
    return recommendation;
}
