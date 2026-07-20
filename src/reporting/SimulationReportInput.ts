import type {PokieGameManifest} from "../gamepackage/PokieGameManifest.js";
import type {SimulationBreakdownComponent} from "../simulation/SimulationBreakdownComponent.js";
import type {SimulationConvergenceOutcome} from "../simulation/SimulationConvergenceOutcome.js";
import type {SimulationStatistics} from "../simulation/SimulationStatistics.js";
import type {SimulationStopReason} from "../simulation/SimulationStopReason.js";

export type SimulationReportInput = {
    manifest: PokieGameManifest;
    requestedRounds: number;
    seed?: string;
    statistics: SimulationStatistics;
    durationMs: number;
    packageRoot?: string;
    // From AggregateSimulationRunner.getBreakdownStatistics(); undefined when the session never
    // exposed the optional categorization contract, in which case the report simply won't have a
    // "breakdown" field (same additive-optional pattern as reproducibility/warnings/recommendations).
    breakdown?: Record<string, SimulationBreakdownComponent>;
    // Number of worker threads used (1 by default) — see ParallelSimulationRunner/WorkerSeedStrategy.
    workers?: number;
    // A human-readable description of how per-worker seeds were derived — see
    // WorkerSeedStrategy.describe(). Only meaningful alongside `workers`.
    workerSeedStrategy?: string;
    // Set when the run was locked to one bet mode (see ParallelSimulationRunOptions.betModeId). When
    // present, SimulationReportBuilder derives the report's core rtp/totalBet/totalWin/hitFrequency/
    // maxWin from `breakdown` (summed across categories, via summarizeSimulationBreakdown) instead of
    // from `statistics` directly — `statistics` stays nominal-bet-based (see AggregateSimulationRunner),
    // which understates a locked ante/buy mode's real cost; `breakdown`'s own totals are stake-based
    // whenever a bet mode was locked (see AggregateSimulationRunner's own betModeSelector parameter).
    betMode?: string;
    // This mode's declared RTP target, looked up by the caller (pokie sim) from the loaded game
    // package's declarative getBetModes() — SimulationReportBuilder never looks this up itself (it has
    // no access to the PokieGame/blueprint, only these raw ingredients), it just carries it onto the
    // report and computes the trivial rtp - targetRtp deviation. Meaningless without `betMode` also
    // being set, but not enforced here — an absent targetRtp simply means the game didn't declare one.
    targetRtp?: number;
    // From ParallelSimulationResult.stopReason — see SimulationReport.stopReason's own doc comment.
    stopReason?: SimulationStopReason;
    // From ParallelSimulationResult.convergence — see SimulationReport.convergence's own doc comment.
    convergence?: SimulationConvergenceOutcome;
};
