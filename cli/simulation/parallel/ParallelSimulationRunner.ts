import {loadPokieGame, PokieGame, PokieGameManifest, SimulationBreakdownComponent, SimulationStatistics, SimulationStatisticsMerger} from "pokie";
import {MAX_SIMULATION_WORKERS} from "./ParallelSimulationLimits.js";
import {runChunkedSimulation} from "./runChunkedSimulation.js";
import {SimulationCancelledError} from "./SimulationCancelledError.js";
import {SimulationWorkerCoordinator} from "./SimulationWorkerCoordinator.js";
import type {SimulationWorkerRequest} from "./SimulationWorkerRequest.js";
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
    // simulationWorkerEntry.ts). Defaults to the real loadPokieGame; tests may inject an in-memory
    // fake here exactly as SimCommand's own constructor already allows.
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
    // Where the compiled simulationWorkerEntry.js lives — required only when workers > 1. No default
    // (see SimulationWorkerCoordinator's own doc comment): resolving it needs import.meta.url, which
    // only works in the real ESM build, not a direct ts-jest unit-test import of this file.
    workerEntryUrl?: URL;
    createWorkerCoordinator?: (workerEntryUrl: URL) => SimulationWorkerCoordinator;
};

export type ParallelSimulationRunResult = {
    manifest: PokieGameManifest;
    statistics: SimulationStatistics;
    breakdown?: Record<string, SimulationBreakdownComponent>;
    workers: number;
    workerSeedStrategy: string;
};

// The one shared entry point `pokie sim --workers` and Studio's simulation service both call for any
// workers >= 1 — see docs/simulation.md. workers===1 runs in-process (see runInProcess()); workers>1
// splits `rounds` across real worker threads (see splitRoundsAcrossWorkers/SimulationWorkerCoordinator),
// deriving each worker's own seed (see WorkerSeedStrategy) and merging their results via
// SimulationStatisticsMerger. Either way, the actual calculation is always
// AggregateSimulationRunner/SimulationAccumulator/SimulationStatistics — never reimplemented here.
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
    public run(): Promise<ParallelSimulationRunResult> {
        try {
            const workers = this.validateWorkers(this.options.workers ?? 1);
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
    private async runInProcess(): Promise<ParallelSimulationRunResult> {
        const loadGame = this.options.loadGame ?? loadPokieGame;
        const game = await loadGame(this.packageRoot);
        const session = game.createSession(this.options.seed === undefined ? undefined : {seed: this.options.seed});
        // Simulations measure RTP/volatility, not risk of ruin — same as every other simulation path.
        session.setCreditsAmount(Number.MAX_SAFE_INTEGER);

        const chunkSize = Math.max(1, this.options.chunkSize ?? this.rounds);
        const yieldToEventLoop = this.options.yieldToEventLoop ?? defaultYieldToEventLoop;

        const {accumulator, breakdown} = await runChunkedSimulation(session, this.rounds, chunkSize, {
            shouldStop: () => this.options.signal?.aborted ?? false,
            onChunkComplete: async ({roundsCompleted, isFinished}) => {
                this.options.onProgress?.(roundsCompleted);
                if (!isFinished) {
                    await yieldToEventLoop();
                }
            },
        });

        return {
            manifest: game.getManifest(),
            statistics: accumulator.getStatistics(),
            breakdown,
            workers: 1,
            workerSeedStrategy: WorkerSeedStrategy.describe(this.options.seed, 1),
        };
    }

    private async runAcrossWorkers(workers: number): Promise<ParallelSimulationRunResult> {
        if (!this.options.workerEntryUrl) {
            throw new Error(
                `ParallelSimulationRunner requires a workerEntryUrl to run with workers > 1 (requested ${workers}).`,
            );
        }

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
        };
    }

    private buildRequests(workers: number): SimulationWorkerRequest[] {
        const progressChunkSize = this.options.chunkSize ?? DEFAULT_PROGRESS_CHUNK_SIZE;
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
            });
        });
        return requests;
    }

    private reportProgress(progressByWorker: Map<number, number>, progress: {workerIndex: number; roundsCompleted: number}): void {
        progressByWorker.set(progress.workerIndex, progress.roundsCompleted);
        let total = 0;
        progressByWorker.forEach((roundsCompleted) => {
            total += roundsCompleted;
        });
        this.options.onProgress?.(total);
    }

    private validateWorkers(workers: number): number {
        if (!Number.isInteger(workers) || workers < 1 || workers > MAX_SIMULATION_WORKERS) {
            throw new Error(`"workers" must be an integer between 1 and ${MAX_SIMULATION_WORKERS}, got ${workers}.`);
        }
        return workers;
    }
}
