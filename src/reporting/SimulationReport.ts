import type {SimulationReportBreakdown} from "./SimulationReportBreakdown.js";

export type SimulationReportReproducibility = {
    game: {id: string; name: string; version: string};
    seed: string | null;
    requestedRounds: number;
    actualRounds: number;
    command: string;
    // A plain, human-readable description of how each worker's seed was derived from the top-level
    // seed (see WorkerSeedStrategy.describe()) — present whenever `workers` is, i.e. whenever the
    // caller populated this reproducibility block at all (see SimulationReportBuilder). Optional only
    // for backward compatibility with older SimulationReport JSON that predates --workers.
    workerSeedStrategy?: string;
};

export type SimulationReport = {
    game: {id: string; name: string; version: string};
    requestedRounds: number;
    rounds: number;
    seed: string | null;
    totalBet: number;
    totalWin: number;
    rtp: number;
    hitFrequency: number;
    maxWin: number;
    durationMs: number;
    spinsPerSecond: number;
    // Number of worker threads the run was split across (1 by default). Optional only for backward
    // compatibility with SimulationReport JSON produced before --workers existed — every current
    // caller (pokie sim, Studio) always sets it. See docs/simulation.md for what workers=1 vs.
    // workers>1 guarantees (and doesn't guarantee) about matching the other's exact numbers.
    workers?: number;
    reproducibility?: SimulationReportReproducibility;
    warnings?: string[];
    recommendations?: string[];
    breakdown?: SimulationReportBreakdown;
    // The bet mode this run was locked to (see ParallelSimulationRunOptions.betModeId) — absent for a
    // run that never selected one, same as every other additive-optional field on this type.
    betMode?: string;
};
