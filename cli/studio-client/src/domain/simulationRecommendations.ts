// Simulation recommendations are authored by the core report builder and are also rendered by the CLI,
// so they describe terminal flags. Studio has equivalent controls; translate the known CLI phrasing at
// the browser boundary without changing the persisted report text.
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
