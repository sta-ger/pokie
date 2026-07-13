import {loadPokieGame} from "../../gamepackage/loadPokieGame.js";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import type {PokieGameManifest} from "../../gamepackage/PokieGameManifest.js";
import type {SimulationBreakdownComponent} from "../SimulationBreakdownComponent.js";
import type {SimulationStatistics} from "../SimulationStatistics.js";
import {SimulationStatisticsMerger} from "../SimulationStatisticsMerger.js";
import {runChunkedSimulation} from "./internal/runChunkedSimulation.js";
import {MAX_SIMULATION_WORKERS} from "./ParallelSimulationLimits.js";
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
};

export type ParallelSimulationResult = {
    manifest: PokieGameManifest;
    statistics: SimulationStatistics;
    breakdown?: Record<string, SimulationBreakdownComponent>;
    workers: number;
    workerSeedStrategy: string;
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
