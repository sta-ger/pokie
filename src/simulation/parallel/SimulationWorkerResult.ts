import type {PokieGameManifest} from "../../gamepackage/PokieGameManifest.js";
import type {SimulationAccumulatorSnapshot} from "../SimulationAccumulatorSnapshot.js";
import type {SimulationBreakdownComponent} from "../SimulationBreakdownComponent.js";
import type {SimulationConvergenceOutcome} from "../SimulationConvergenceOutcome.js";
import type {SimulationStopReason} from "../SimulationStopReason.js";

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
    // Why this worker stopped — "maxRounds" whenever it played its whole share, "sessionStopped"/
    // "converged" otherwise (see SimulationStopReason). Optional only for backward compatibility with
    // a hand-built SimulationWorkerResult that predates this field (e.g. an older test fixture);
    // ParallelSimulationRunner treats an absent value as "maxRounds" when aggregating across workers.
    stopReason?: SimulationStopReason;
    // Present only when this worker's request carried SimulationWorkerRequest.convergence — see
    // SimulationConvergenceChecker.buildOutcome().
    convergence?: SimulationConvergenceOutcome;
};
