import type {SimulationConvergenceOutcome} from "../simulation/SimulationConvergenceOutcome.js";
import type {SimulationStopReason} from "../simulation/SimulationStopReason.js";
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
    // This mode's declared RTP target (see gamepackage/BetMode.ts's own targetRtp field) — set by the
    // caller (pokie sim reads it straight off the loaded game package's getBetModes(), never guesses
    // or derives it), so absent whenever the game doesn't declare one for the locked mode, or no mode
    // was locked at all. rtpDeviation (rtp - targetRtp) is only present alongside it.
    targetRtp?: number;
    rtpDeviation?: number;
    // Passthroughs/trivial derivations from the same SimulationStatistics this report's core rtp/
    // totalBet/totalWin already come from (see SimulationReportBuilder) — no simulation math is
    // duplicated here, only surfaced. averageBet/averagePayout are totalBet/totalWin divided by
    // rounds, using this report's OWN (possibly bet-mode-overridden) totalBet/totalWin — never
    // SimulationStatistics.averageBet/averagePayout directly, since those stay nominal-bet-based even
    // when a mode is locked (see SimulationReportBuilder's own comment on why).
    averageBet?: number;
    averagePayout?: number;
    // Standard deviation of per-round payout amounts (SimulationStatistics.volatility) — a property of
    // the payouts actually won, so unaffected by whether this run locked a bet mode (unlike
    // totalBet/rtp, which depend on which stake basis is being charged).
    volatility?: number;
    // Raw round counts per payout bucket (SimulationStatistics.payoutHistogram, passed through
    // unchanged) — see PayoutHistogramBucketOrder.ts for the fixed bucket keys/ordering this uses.
    payoutHistogram?: Record<string, number>;
    // Share of rounds whose payout fell in the same bucket as this run's own maxWin (see
    // PayoutHistogramBucketOrder.ts) — a derived read of payoutHistogram, not a new statistic: how
    // often a round produced a payout on the scale of the biggest one observed.
    maxWinFrequency?: number;
    // Why this run stopped at `rounds` rather than necessarily playing every `requestedRounds` — see
    // SimulationStopReason. Optional only for backward compatibility with a SimulationReport JSON that
    // predates this field (every current caller, pokie sim included, always sets it).
    stopReason?: SimulationStopReason;
    // Present only when this run opted into ParallelSimulationRunOptions.convergence (see `pokie sim`'s
    // --min-rounds/--rtp-tolerance/--check-interval/--stable-checks flags) — absent for every run that
    // used the plain fixed-round path, same as betMode/targetRtp being absent for a run that never
    // locked a bet mode.
    convergence?: SimulationConvergenceOutcome;
};
