import type {SimulationConvergenceOptions} from "../SimulationConvergenceOptions.js";

// The plain-data "recipe" ParallelSimulationRunner sends a worker thread over workerData — everything
// a worker needs to independently load the same game package and play its own share of rounds.
// Deliberately contains no class instances/functions/live sessions: worker_threads structured-clones
// workerData, which would silently drop or throw on any of those (see docs/simulation.md's worker
// package-loading limitations note).
export type SimulationWorkerRequest = {
    workerIndex: number;
    totalWorkers: number;
    packageRoot: string;
    rounds: number;
    // Already the derived per-worker seed (see WorkerSeedStrategy) — the worker itself doesn't derive
    // anything, it just plays with whatever seed it's given (or none).
    seed?: string;
    // How many rounds to play before reporting an interim progress message — mirrors
    // StudioSimulationService's previous chunkSize concept, now generalized to per-worker chunking.
    progressChunkSize: number;
    // Locks this worker's share of the run to one bet mode (see ParallelSimulationRunOptions.betModeId)
    // — a plain string (not a FixedBetModeForNextSimulationRoundSetting instance), since only plain
    // data survives the worker_threads structured-clone boundary; simulationWorkerEntry.ts builds the
    // real strategy object from it locally.
    betModeId?: string;
    // Opt-in adaptive early stop for this worker's own share (see SimulationConvergenceOptions) — a
    // plain data object, safe for structured clone. Undefined by default, so a caller that never sets
    // ParallelSimulationRunOptions.convergence is unaffected. Evaluated independently against this
    // worker's own accumulator, not a global one merged across workers — see
    // docs/simulation.md's convergence section for why.
    convergence?: SimulationConvergenceOptions;
};
