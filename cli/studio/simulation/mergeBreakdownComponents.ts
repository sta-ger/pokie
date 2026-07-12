import type {SimulationBreakdownComponent} from "pokie";

// AggregateSimulationRunner produces one breakdown Record per run() call; StudioSimulationService
// drives a simulation in chunks (see its own doc comment for why), so this is the small piece of
// glue needed to combine one chunk's breakdown into the job's running total — the categorization
// logic itself (which round belongs to which category) stays entirely inside AggregateSimulationRunner,
// untouched; this only ever combines its already-computed output numbers.
//
// `hitFrequency` is reconstructed to a hit *count* (rounds * hitFrequency, rounded) before combining
// since SimulationBreakdownComponent doesn't expose the raw count — safe here because both operands
// come from an integer number of rounds, so the rounding recovers the exact original count.
export function mergeBreakdownComponents(
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
