import {loadPokieGame} from "../../gamepackage/loadPokieGame.js";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {PokieGameManifest} from "../../gamepackage/PokieGameManifest.js";
import {FixedBetModeForNextSimulationRoundSetting} from "../FixedBetModeForNextSimulationRoundSetting.js";
import type {SimulationBreakdownComponent} from "../SimulationBreakdownComponent.js";
import {SimulationConvergenceChecker} from "../SimulationConvergenceChecker.js";
import type {SimulationConvergenceOptions} from "../SimulationConvergenceOptions.js";
import type {SimulationConvergenceOutcome} from "../SimulationConvergenceOutcome.js";
import type {SimulationStatistics} from "../SimulationStatistics.js";
import {SimulationStatisticsMerger} from "../SimulationStatisticsMerger.js";
import type {SimulationStopReason} from "../SimulationStopReason.js";
import {runChunkedSimulation} from "./internal/runChunkedSimulation.js";
import {MAX_SIMULATION_WORKERS} from "./ParallelSimulationLimits.js";
import {SimulationCancelledError} from "./SimulationCancelledError.js";
import {SimulationWorkerCoordinator} from "./SimulationWorkerCoordinator.js";
import type {SimulationWorkerRequest} from "./SimulationWorkerRequest.js";
import type {SimulationWorkerResult} from "./SimulationWorkerResult.js";
import {splitRoundsAcrossWorkers} from "./splitRoundsAcrossWorkers.js";
import {WorkerSeedStrategy} from "./WorkerSeedStrategy.js";

const DEFAULT_PROGRESS_CHUNK_SIZE = 1000;

function defaultYieldToEventLoop(): Promise<void> {
    return new Promise((resolve) => {
        setImmediate(resolve);
    });
}

export type ParallelSimulationRunOptions = {
    seed?: string;
    // 1 by default — a single worker (run in-process, not a real thread — see runInProcess()) playing
    // every requested round, unsplit, with the original seed unchanged (see WorkerSeedStrategy) so its
    // statistics are identical to what the pre-existing single-threaded AggregateSimulationRunner path
    // would have produced for the same seed. workers > 1 is a genuinely different execution (rounds
    // split across independent RNG streams, real worker threads) — see docs/simulation.md: workers=1
    // and workers>1 are each internally reproducible for a fixed seed/workers, but are NOT expected to
    // produce identical statistics to each other.
    workers?: number;
    signal?: AbortSignal;
    // Only used by the workers===1 in-process path — a live game/session can't cross a worker_threads
    // boundary, so workers > 1 always (re)loads the package for real inside each worker instead (see
    // internal/simulationWorkerEntry.ts). Defaults to the real loadPokieGame; a caller may inject an
    // in-memory fake here (as pokie's own CLI does for its unit tests) for workers===1 only.
    loadGame?: (packageRoot: string) => Promise<PokieGame>;
    // How many rounds to play before reporting an interim progress message / yielding to the event
    // loop (workers===1) or posting a progress message (workers>1). Defaults to the full round count
    // (a single chunk) for workers===1, which makes that path byte-for-byte identical in behavior —
    // no extra event-loop yields — to calling AggregateSimulationRunner directly; callers that need
    // incremental progress/responsive cancellation (e.g. Studio) pass a smaller size explicitly.
    chunkSize?: number;
    yieldToEventLoop?: () => Promise<void>;
    // Aggregate rounds completed across every worker.
    onProgress?: (roundsCompleted: number) => void;
    // Where the compiled worker entry point lives — optional. When omitted (the common case), workers
    // > 1 uses this package's own bundled worker entry automatically; only supply this to point at a
    // different build (e.g. a test pointing at source, or an embedder shipping its own copy).
    workerEntryUrl?: URL;
    createWorkerCoordinator?: (workerEntryUrl: URL | undefined) => SimulationWorkerCoordinator;
    // Locks the whole run to one bet mode id (see VideoSlotWithBetModesSession/BetModeSelecting) --
    // (re-)selected before every round (see FixedBetModeForNextSimulationRoundSetting), whether
    // workers===1 (in-process) or workers>1 (each worker builds its own instance from the plain string
    // it receives, see SimulationWorkerRequest.betModeId). A session that doesn't support bet modes at
    // all is unaffected either way — fully backward compatible for games without configured betModes.
    betModeId?: string;
    // Opt-in adaptive early stop (see SimulationConvergenceOptions) — absent by default, so an existing
    // caller is completely unaffected: `rounds` is always played in full, exactly as before this
    // existed. When set, evaluated independently per execution unit (the whole run for workers===1, or
    // each worker's own share for workers>1 — see runAcrossWorkers()'s own doc comment for why),
    // reusing the exact same SimulationAccumulator/ConfidenceIntervalCalculator every other simulation
    // path already relies on — no simulation math is duplicated for this feature.
    convergence?: SimulationConvergenceOptions;
};

export type ParallelSimulationResult = {
    manifest: PokieGameManifest;
    statistics: SimulationStatistics;
    breakdown?: Record<string, SimulationBreakdownComponent>;
    workers: number;
    workerSeedStrategy: string;
    // Echoes back options.betModeId, when the run was locked to one — lets a caller (e.g.
    // SimulationReportBuilder) label the resulting report without threading its own copy of the option
    // through separately.
    betMode?: string;
    // Why the run stopped — "maxRounds" whenever every requested round was played. Always populated
    // (not only when options.convergence was set), since AggregateSimulationRunner/runChunkedSimulation
    // already track this for the pre-existing "session stopped itself early" case.
    stopReason: SimulationStopReason;
    // Present only when options.convergence was set — see SimulationConvergenceOutcome.
    convergence?: SimulationConvergenceOutcome;
};

// The public entry point for running a simulation, sequentially or in parallel, programmatically —
// the same object `pokie sim --workers`/Studio's Simulation tab call, and the only piece of the
// public API a caller needs for either case. workers===1 runs in-process (see runInProcess()) with
// no worker thread involved at all; workers>1 splits `rounds` across real worker threads (see
// splitRoundsAcrossWorkers/SimulationWorkerCoordinator), deriving each worker's own seed (see
// WorkerSeedStrategy) and merging their results via SimulationStatisticsMerger. Either way, the
// actual calculation is always AggregateSimulationRunner/SimulationAccumulator/SimulationStatistics —
// never reimplemented here.
export class ParallelSimulationRunner {
    private readonly packageRoot: string;
    private readonly rounds: number;
    private readonly options: ParallelSimulationRunOptions;

    constructor(packageRoot: string, rounds: number, options: ParallelSimulationRunOptions = {}) {
        this.packageRoot = packageRoot;
        this.rounds = rounds;
        this.options = options;
    }

    // Never throws synchronously — every failure (a workers validation error included) comes back as
    // a rejected promise, so a caller can always rely on .catch()/await-in-try, without also needing
    // a synchronous try/catch just around the call to run() itself.
    public run(): Promise<ParallelSimulationResult> {
        try {
            const workers = this.validateWorkers(this.options.workers ?? 1);
            this.validateConvergence(this.options.convergence);
            if (this.options.signal?.aborted) {
                return Promise.reject(new SimulationCancelledError());
            }

            return workers === 1 ? this.runInProcess() : this.runAcrossWorkers(workers);
        } catch (error) {
            return Promise.reject(error);
        }
    }

    // Byte-for-byte the pre-existing sequential path: one session, played via runChunkedSimulation
    // (which — at the default chunkSize of `this.rounds`, i.e. one single chunk — plays every round
    // in exactly one AggregateSimulationRunner.run() call, identical to calling it directly). A
    // smaller chunkSize is purely an orchestration detail (progress/cancellation granularity for a
    // caller like Studio) that never changes the resulting statistics.
    private async runInProcess(): Promise<ParallelSimulationResult> {
        const loadGame = this.options.loadGame ?? loadPokieGame;
        const game = await loadGame(this.packageRoot);
        const session = game.createSession(this.options.seed === undefined ? undefined : {seed: this.options.seed});
        // Simulations measure RTP/volatility, not risk of ruin — same as every other simulation path.
        session.setCreditsAmount(Number.MAX_SAFE_INTEGER);

        const convergence = this.options.convergence;
        const convergenceChecker = convergence ? new SimulationConvergenceChecker(convergence) : undefined;
        // A convergence check can only happen at a chunk boundary, so checkIntervalRounds — not a
        // caller-supplied chunkSize — becomes the effective chunk size once convergence is enabled.
        const chunkSize = Math.max(1, convergence?.checkIntervalRounds ?? this.options.chunkSize ?? this.rounds);
        const yieldToEventLoop = this.options.yieldToEventLoop ?? defaultYieldToEventLoop;
        const betModeSelector =
            this.options.betModeId !== undefined ? new FixedBetModeForNextSimulationRoundSetting(this.options.betModeId) : undefined;

        const {accumulator, breakdown, stopReason} = await runChunkedSimulation(
            session,
            this.rounds,
            chunkSize,
            {
                shouldStop: () => this.options.signal?.aborted ?? false,
                onChunkComplete: async ({roundsCompleted, isFinished}) => {
                    this.options.onProgress?.(roundsCompleted);
                    if (!isFinished) {
                        await yieldToEventLoop();
                    }
                },
                checkConvergence: convergenceChecker
                    ? (acc, roundsCompleted) => convergenceChecker.check(acc, roundsCompleted).converged
                    : undefined,
            },
            betModeSelector,
        );

        return {
            manifest: game.getManifest(),
            statistics: accumulator.getStatistics(),
            breakdown,
            workers: 1,
            workerSeedStrategy: WorkerSeedStrategy.describe(this.options.seed, 1),
            betMode: this.options.betModeId,
            stopReason,
            convergence: convergenceChecker?.buildOutcome(),
        };
    }

    // When options.convergence is set, each worker evaluates it independently against its own share's
    // running accumulator (see SimulationWorkerRequest.convergence/simulationWorkerEntry.ts) — there is
    // no live cross-worker coordination of a single global running RTP. This keeps the multi-worker
    // path exactly as deterministic/reproducible as it already was (see WorkerSeedStrategy/
    // docs/simulation.md's reproducibility guarantees): each worker's stop point depends only on its
    // own derived seed and its own share of rounds, never on message-arrival timing across threads,
    // which real coordination would make non-deterministic. The tradeoff — documented in
    // docs/simulation.md — is that minRounds/checkIntervalRounds/rtpTolerance should be sized relative
    // to each worker's share (roughly rounds/workers), not to the total requested rounds.
    private async runAcrossWorkers(workers: number): Promise<ParallelSimulationResult> {
        const requests = this.buildRequests(workers);
        const coordinator = this.options.createWorkerCoordinator
            ? this.options.createWorkerCoordinator(this.options.workerEntryUrl)
            : new SimulationWorkerCoordinator(this.options.workerEntryUrl);

        const progressByWorker = new Map<number, number>();
        const results = await coordinator.run(requests, {
            signal: this.options.signal,
            onProgress: this.options.onProgress ? (progress) => this.reportProgress(progressByWorker, progress) : undefined,
        });

        const merger = new SimulationStatisticsMerger();
        const merged = merger.merge(results.map((result) => ({accumulator: result.accumulator, breakdown: result.breakdown})));

        return {
            manifest: results[0].manifest,
            statistics: merged.statistics,
            breakdown: merged.breakdown,
            workers,
            workerSeedStrategy: WorkerSeedStrategy.describe(this.options.seed, workers),
            betMode: this.options.betModeId,
            stopReason: this.aggregateStopReason(results),
            convergence: this.aggregateConvergence(results),
        };
    }

    private buildRequests(workers: number): SimulationWorkerRequest[] {
        const convergence = this.options.convergence;
        const progressChunkSize = convergence?.checkIntervalRounds ?? this.options.chunkSize ?? DEFAULT_PROGRESS_CHUNK_SIZE;
        const requests: SimulationWorkerRequest[] = [];
        splitRoundsAcrossWorkers(this.rounds, workers).forEach((share, workerIndex) => {
            // A worker with a zero-round share (rounds < workers) is never spawned — there is nothing
            // for it to do, and spawning a thread just to have it exit immediately would only waste
            // resources.
            if (share <= 0) {
                return;
            }
            requests.push({
                workerIndex,
                totalWorkers: workers,
                packageRoot: this.packageRoot,
                rounds: share,
                seed: WorkerSeedStrategy.deriveSeed(this.options.seed, workerIndex, workers),
                progressChunkSize,
                betModeId: this.options.betModeId,
                convergence,
            });
        });
        return requests;
    }

    // sessionStopped always takes precedence — a session ending early is the most notable outcome, and
    // worth surfacing regardless of what any other worker did. Otherwise, "converged" requires EVERY
    // contributing worker to have independently converged: if even one worker exhausted its own share
    // without satisfying its own checker, the merged report mixes a converged estimate with a plain
    // fixed-round one, and the honest overall answer is "maxRounds" — a single converged worker among
    // several that didn't never makes the whole run "converged". A worker result without stopReason (an
    // older hand-built SimulationWorkerResult) is treated as "maxRounds" — the same "absent means the
    // pre-existing behavior" default used everywhere else in this file. An empty `results` (e.g. a
    // zero-round request) is "maxRounds" too — Array.prototype.every() on an empty array is vacuously
    // true, which would otherwise misreport "converged" for a run that never played anything.
    private aggregateStopReason(results: SimulationWorkerResult[]): SimulationStopReason {
        if (results.length === 0) {
            return "maxRounds";
        }
        const reasons = results.map((result) => result.stopReason ?? "maxRounds");
        if (reasons.some((reason) => reason === "sessionStopped")) {
            return "sessionStopped";
        }
        if (reasons.every((reason) => reason === "converged")) {
            return "converged";
        }
        return "maxRounds";
    }

    // Summarizes every worker's independently-evaluated convergence outcome (see runAcrossWorkers()'s
    // own doc comment on why there's one checker per worker, not one global checker) into a single
    // report-level figure: checksPerformed sums (total work done across every worker),
    // consecutiveStableChecks takes the minimum (the weakest-converged worker), achievedRtpHalfWidth
    // takes the maximum (the least-precise worker's estimate) — a conservative summary, never a made-up
    // "global" statistic recomputed from the merged accumulator.
    private aggregateConvergence(results: SimulationWorkerResult[]): SimulationConvergenceOutcome | undefined {
        const outcomes = results.map((result) => result.convergence).filter((outcome): outcome is SimulationConvergenceOutcome => Boolean(outcome));
        if (outcomes.length === 0) {
            return undefined;
        }
        return {
            minRounds: outcomes[0].minRounds,
            rtpTolerance: outcomes[0].rtpTolerance,
            checkIntervalRounds: outcomes[0].checkIntervalRounds,
            stableChecks: outcomes[0].stableChecks,
            checksPerformed: outcomes.reduce((sum, outcome) => sum + outcome.checksPerformed, 0),
            consecutiveStableChecks: Math.min(...outcomes.map((outcome) => outcome.consecutiveStableChecks)),
            achievedRtpHalfWidth: Math.max(...outcomes.map((outcome) => outcome.achievedRtpHalfWidth)),
        };
    }

    private reportProgress(progressByWorker: Map<number, number>, progress: {workerIndex: number; roundsCompleted: number}): void {
        progressByWorker.set(progress.workerIndex, progress.roundsCompleted);
        let total = 0;
        progressByWorker.forEach((roundsCompleted) => {
            total += roundsCompleted;
        });
        this.options.onProgress?.(total);
    }

    private validateConvergence(convergence: SimulationConvergenceOptions | undefined): void {
        if (!convergence) {
            return;
        }
        if (!Number.isInteger(convergence.minRounds) || convergence.minRounds < 0) {
            throw new Error(`"convergence.minRounds" must be a non-negative integer, got ${convergence.minRounds}.`);
        }
        if (!Number.isFinite(convergence.rtpTolerance) || convergence.rtpTolerance <= 0) {
            throw new Error(`"convergence.rtpTolerance" must be a positive number, got ${convergence.rtpTolerance}.`);
        }
        if (!Number.isInteger(convergence.checkIntervalRounds) || convergence.checkIntervalRounds <= 0) {
            throw new Error(`"convergence.checkIntervalRounds" must be a positive integer, got ${convergence.checkIntervalRounds}.`);
        }
        if (convergence.stableChecks !== undefined && (!Number.isInteger(convergence.stableChecks) || convergence.stableChecks <= 0)) {
            throw new Error(`"convergence.stableChecks" must be a positive integer, got ${convergence.stableChecks}.`);
        }
    }

    private validateWorkers(workers: number): number {
        if (!Number.isInteger(workers) || workers < 1 || workers > MAX_SIMULATION_WORKERS) {
            throw new Error(`"workers" must be an integer between 1 and ${MAX_SIMULATION_WORKERS}, got ${workers}.`);
        }
        return workers;
    }
}
