import type {PokieGameManifest, SimulationAccumulatorSnapshot, SimulationBreakdownComponent} from "pokie";

// The plain-data result a worker thread posts back once it's finished its share of rounds — safe to
// structured-clone back across the worker_threads boundary (no session/class instances), and exactly
// what SimulationStatisticsMerger needs to fold into the final report alongside every other worker's
// result.
export type SimulationWorkerResult = {
    workerIndex: number;
    manifest: PokieGameManifest;
    accumulator: SimulationAccumulatorSnapshot;
    breakdown?: Record<string, SimulationBreakdownComponent>;
    // The rounds this worker actually played — may be less than its requested share if the session
    // stopped itself early (canPlayNextGame() returning false), same "actual can be less than
    // requested" behavior `pokie sim` already has for the single-threaded path.
    roundsCompleted: number;
};
