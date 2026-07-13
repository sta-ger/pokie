// Splits `rounds` as evenly as possible across `workers` shares, always summing back to exactly
// `rounds`: the first `rounds % workers` workers get one extra round. When rounds < workers, the
// first `rounds` entries get exactly 1 round and the rest get 0 (see ParallelSimulationRunner, which
// never spawns a worker for a 0-round share).
export function splitRoundsAcrossWorkers(rounds: number, workers: number): number[] {
    const base = Math.floor(rounds / workers);
    const remainder = rounds % workers;
    return Array.from({length: workers}, (_, index) => base + (index < remainder ? 1 : 0));
}
