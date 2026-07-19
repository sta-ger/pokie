import type {SimulationBreakdownComponent} from "./SimulationBreakdownComponent.js";

// Combines one additional chunk's/worker's category breakdown into a running total. Shared by
// SimulationStatisticsMerger (combining across worker threads) and simulationWorkerEntry (combining
// a single worker's own internal progress-reporting chunks) — the one place breakdown-merging
// arithmetic lives, so neither ever reimplements it.
//
// `hitFrequency` is reconstructed to a hit *count* (rounds * hitFrequency, rounded) before combining
// since SimulationBreakdownComponent doesn't expose the raw count — safe here because both operands
// come from an integer number of rounds, so the rounding recovers the exact original count.
export function mergeSimulationBreakdowns(
    base: Record<string, SimulationBreakdownComponent> | undefined,
    addition: Record<string, SimulationBreakdownComponent>,
): Record<string, SimulationBreakdownComponent> {
    const merged: Record<string, SimulationBreakdownComponent> = {...base};
    for (const [category, component] of Object.entries(addition)) {
        const existing = merged[category];
        merged[category] = existing === undefined ? component : mergeComponent(existing, component);
    }
    return merged;
}

// Folds every category of a breakdown into one overall component -- reuses the exact same
// mergeComponent() the rest of this file already relies on, so a mode-locked simulation's overall
// rtp/totalBet/totalWin/hitFrequency/maxWin (summed across "base"/"freeGames"/whatever else) is never
// a second, parallel implementation of this arithmetic (see SimulationReportBuilder). undefined for an
// empty breakdown (nothing to summarize), same as getBreakdownStatistics() itself being undefined
// signals "not categorized" rather than "categorized with zero categories".
export function summarizeSimulationBreakdown(
    breakdown: Record<string, SimulationBreakdownComponent>,
): SimulationBreakdownComponent | undefined {
    const components = Object.values(breakdown);
    if (components.length === 0) {
        return undefined;
    }
    return components.reduce(mergeComponent);
}

function mergeComponent(a: SimulationBreakdownComponent, b: SimulationBreakdownComponent): SimulationBreakdownComponent {
    const rounds = a.rounds + b.rounds;
    const totalBet = a.totalBet + b.totalBet;
    const totalWin = a.totalWin + b.totalWin;
    const hitCount = Math.round(a.hitFrequency * a.rounds) + Math.round(b.hitFrequency * b.rounds);
    return {
        rounds,
        totalBet,
        totalWin,
        rtp: totalBet > 0 ? totalWin / totalBet : 0,
        hitFrequency: rounds > 0 ? hitCount / rounds : 0,
        maxWin: Math.max(a.maxWin, b.maxWin),
    };
}
