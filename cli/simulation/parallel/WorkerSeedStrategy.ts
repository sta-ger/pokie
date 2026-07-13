// Derives each worker's own seed from the simulation's original --seed, deterministically and
// stably: the same (seed, workerIndex, totalWorkers) always produces the same derived seed, so a
// `pokie sim --seed X --workers N` run is fully reproducible run-to-run for a fixed N (see
// docs/simulation.md's reproducibility guarantees — this is NOT the same numbers as --workers 1,
// only reproducible against itself).
//
// totalWorkers === 1 is the identity case on purpose: with exactly one worker there is nothing to
// decorrelate against, and using the seed unchanged is what makes a single-worker parallel run
// produce byte-identical statistics to the pre-existing sequential path for the same seed.
//
// For totalWorkers > 1, each worker's seed is a distinct string derived from the original seed plus
// its own index — different enough that no two workers draw from a correlated/identical RNG stream,
// without needing a cryptographic derivation (this is for simulation variety, not security).
export class WorkerSeedStrategy {
    public static deriveSeed(seed: string | undefined, workerIndex: number, totalWorkers: number): string | undefined {
        if (seed === undefined) {
            return undefined;
        }
        if (totalWorkers <= 1) {
            return seed;
        }
        return `${seed}::worker${workerIndex}/${totalWorkers}`;
    }

    public static describe(seed: string | undefined, totalWorkers: number): string {
        if (seed === undefined) {
            return "none (unseeded run — each worker uses its own non-deterministic RNG)";
        }
        if (totalWorkers <= 1) {
            return "identity (single worker uses the original seed unchanged)";
        }
        return `deterministic per-worker derivation: "<seed>::worker<index>/<totalWorkers>"`;
    }
}
