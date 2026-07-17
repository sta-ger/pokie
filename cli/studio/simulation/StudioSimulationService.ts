import {
    loadPokieGame,
    ParallelSimulationRunner,
    ParallelSimulationRunOptions,
    SimulationCancelledError,
    SimulationReport,
    SimulationReportBuilder,
    SimulationReportBuilding,
} from "pokie";
import crypto from "crypto";
import {InMemoryStudioSimulationRepository} from "./InMemoryStudioSimulationRepository.js";
import type {StudioSimulationJobRecord} from "./StudioSimulationJobRecord.js";
import type {StudioSimulationJobView, StudioSimulationStatisticsView} from "./StudioSimulationJobView.js";
import type {StudioSimulationRepository} from "./StudioSimulationRepository.js";
import type {StudioSimulationReportListEntry} from "./StudioSimulationReportListEntry.js";
import type {StudioSimulationStatus} from "./StudioSimulationStatus.js";
import {toStudioSimulationJobView} from "./toStudioSimulationJobView.js";
import type {ValidatedSimulationRequest} from "./validateSimulationRequest.js";

const DEFAULT_CHUNK_SIZE = 1000;

export type StudioSimulationStartResult =
    | {status: "created"; job: StudioSimulationJobView}
    | {status: "conflict"; activeJobId: string};

export type GetSimulationReportResult =
    | {status: "ok"; report: SimulationReport; statistics?: StudioSimulationStatisticsView}
    | {status: "not-found"}
    // Either not terminal yet (queued/running) or terminal without a report (failed/cancelled) —
    // `jobStatus` tells the caller which, so it can phrase a precise message either way.
    | {status: "not-ready"; jobStatus: StudioSimulationStatus};

// Drives the shared ParallelSimulationRunner — the exact same object `pokie sim --workers` calls —
// rather than its own bespoke worker/chunk implementation. workers===1 (Studio's default) runs
// in-process in bounded chunks (see ParallelSimulationRunner.runInProcess()) so a long simulation
// never blocks the HTTP server's event loop; workers>1 spawns real worker threads. Either way,
// progress/cancellation come from the exact same onProgress callback / AbortSignal contract, so this
// class is left with only the job-lifecycle bookkeeping (queued/running/completed/failed/cancelled,
// retention, per-project conflict checks) — none of the simulation logic itself.
export class StudioSimulationService {
    private readonly repository: StudioSimulationRepository;
    private readonly loadGame: typeof loadPokieGame;
    private readonly reportBuilder: SimulationReportBuilding;
    private readonly chunkSize: number;
    private readonly now: () => number;
    private readonly yieldToEventLoop: () => Promise<void>;
    private readonly createId: () => string;
    // Overrides ParallelSimulationRunner's own default worker entry point — left undefined in every
    // real Studio request (StudioServer never sets it), since the library already knows how to find
    // its own bundled worker entry. Only tests (pointing at source rather than a built dist) supply
    // one.
    private readonly workerEntryUrl: URL | undefined;
    private readonly createParallelSimulationRunner: (
        packageRoot: string,
        rounds: number,
        options: ParallelSimulationRunOptions,
    ) => ParallelSimulationRunner;

    constructor(
        repository: StudioSimulationRepository = new InMemoryStudioSimulationRepository(),
        loadGame: typeof loadPokieGame = loadPokieGame,
        reportBuilder: SimulationReportBuilding = new SimulationReportBuilder(),
        chunkSize: number = DEFAULT_CHUNK_SIZE,
        now: () => number = Date.now,
        yieldToEventLoop: () => Promise<void> = () =>
            new Promise((resolve) => {
                setImmediate(resolve);
            }),
        createId: () => string = () => crypto.randomUUID(),
        workerEntryUrl: URL | undefined = undefined,
        createParallelSimulationRunner: (
            packageRoot: string,
            rounds: number,
            options: ParallelSimulationRunOptions,
        ) => ParallelSimulationRunner = (packageRoot, rounds, options) => new ParallelSimulationRunner(packageRoot, rounds, options),
    ) {
        this.repository = repository;
        this.loadGame = loadGame;
        this.reportBuilder = reportBuilder;
        this.chunkSize = chunkSize;
        this.now = now;
        this.yieldToEventLoop = yieldToEventLoop;
        this.createId = createId;
        this.workerEntryUrl = workerEntryUrl;
        this.createParallelSimulationRunner = createParallelSimulationRunner;
    }

    // Returns immediately with a "queued" job — the actual simulation runs in the background (see
    // run()), never blocking the caller (StudioServer's POST handler). Rejects with a conflict
    // instead of creating a second job when one is already queued/running for this projectRoot, so a
    // duplicate/retried request can never corrupt (or race against) the job already in flight.
    public start(projectRoot: string, request: ValidatedSimulationRequest): StudioSimulationStartResult {
        const active = this.repository.findActiveByProjectRoot(projectRoot);
        if (active) {
            return {status: "conflict", activeJobId: active.id};
        }

        const record: StudioSimulationJobRecord = {
            id: this.createId(),
            projectRoot,
            status: "queued",
            rounds: request.rounds,
            seed: request.seed,
            workers: request.workers ?? 1,
            startedAt: this.now(),
            roundsCompleted: 0,
            durationMs: 0,
            abortController: new AbortController(),
        };
        this.repository.save(record);

        // Deferred via queueMicrotask rather than called directly: run() sets record.status to
        // "running" before its own first await (calling createParallelSimulationRunner/.run()
        // synchronously starts that work), so calling it inline here would let that synchronous
        // prefix flip the status before this function's own `return` below runs — a caller polling
        // status right after POST would then never observe "queued" at all. Queuing it instead
        // guarantees run() doesn't execute until after start() has already returned.
        queueMicrotask(() => {
            this.run(record).catch(() => {
                // run() already catches every failure into the record's own "failed" status (see
                // below) — this is an extra safety net only, so a bug there can never surface as an
                // unhandled promise rejection and crash the process.
            });
        });

        return {status: "created", job: toStudioSimulationJobView(record)};
    }

    public getStatus(id: string): StudioSimulationJobView | undefined {
        const record = this.repository.get(id);
        return record ? toStudioSimulationJobView(record) : undefined;
    }

    // Idempotent: cancelling an already-terminal job is a no-op that still returns its (unchanged)
    // current view rather than an error — same "repeated request can't corrupt state" guarantee as
    // start(). Returns undefined only when `id` itself is unknown.
    public cancel(id: string): StudioSimulationJobView | undefined {
        const record = this.repository.get(id);
        if (!record) {
            return undefined;
        }
        if (record.status === "queued" || record.status === "running") {
            record.abortController.abort();
        }
        return toStudioSimulationJobView(record);
    }

    // Best-effort: aborts every currently active job — called from StudioServer.stop() so a stopped
    // Studio process never leaves a simulation (or its worker threads) running against an event loop
    // nobody is serving HTTP requests on anymore.
    public cancelAll(): void {
        for (const record of this.repository.listActive()) {
            record.abortController.abort();
        }
    }

    // Same reasoning as cancelAll(), scoped to one project — called from StudioServer whenever Studio
    // switches away from `projectRoot` (a different project opened, or back to Home), so a simulation
    // for the project just left doesn't keep running (or keep its worker threads alive) unseen and
    // unreachable (its own job/report becomes unreachable through this project's own routes the
    // moment the switch happens anyway — see getReport()/listReports()'s own projectRoot scoping — so
    // leaving it running would only waste CPU, never remain usable). A no-op when nothing is active
    // for that project.
    public cancelActiveForProject(projectRoot: string): void {
        const record = this.repository.findActiveByProjectRoot(projectRoot);
        record?.abortController.abort();
    }

    // Process-wide (not scoped to one project) — feeds GET /api/studio/diagnostics, a plain count safe
    // to expose regardless of which project (if any) is currently active.
    public getActiveCount(): number {
        return this.repository.listActive().length;
    }

    // The Reports tab's list — only ever built from "completed" jobs (the only status with an actual
    // report to summarize); a failed/cancelled job simply never appears here, though it's still
    // tracked by the repository for retention purposes (see StudioSimulationRepository). Always
    // scoped to one projectRoot — never includes another project's jobs.
    public listReports(projectRoot: string): StudioSimulationReportListEntry[] {
        const entries: StudioSimulationReportListEntry[] = [];
        for (const record of this.repository.listTerminalByProjectRoot(projectRoot)) {
            const entry = this.toReportListEntry(record);
            if (entry) {
                entries.push(entry);
            }
        }
        return entries;
    }

    // "not-found" covers both a genuinely unknown id AND an id that belongs to a different project —
    // deliberately indistinguishable from the caller's perspective, so this can never be used to probe
    // whether some other project has a simulation with a given id.
    public getReport(projectRoot: string, id: string): GetSimulationReportResult {
        const record = this.repository.get(id);
        if (!record || record.projectRoot !== projectRoot) {
            return {status: "not-found"};
        }
        if (!record.report) {
            return {status: "not-ready", jobStatus: record.status};
        }
        return {status: "ok", report: record.report, statistics: record.statistics};
    }

    private toReportListEntry(record: StudioSimulationJobRecord): StudioSimulationReportListEntry | undefined {
        if (record.status !== "completed" || !record.report) {
            return undefined;
        }
        const {report} = record;
        return {
            id: record.id,
            status: "completed",
            game: {id: report.game.id, version: report.game.version},
            requestedRounds: report.requestedRounds,
            actualRounds: report.rounds,
            seed: record.seed,
            workers: report.workers ?? record.workers,
            rtp: report.rtp,
            hitFrequency: report.hitFrequency,
            maxWin: report.maxWin,
            startedAt: new Date(record.startedAt).toISOString(),
            completedAt: new Date(record.completedAt ?? record.startedAt).toISOString(),
            durationMs: record.durationMs,
            hasWarnings: (report.warnings?.length ?? 0) > 0,
        };
    }

    private async run(record: StudioSimulationJobRecord): Promise<void> {
        if (record.abortController.signal.aborted) {
            this.cancelRecord(record);
            return;
        }
        record.status = "running";

        const runner = this.createParallelSimulationRunner(record.projectRoot, record.rounds, {
            seed: record.seed,
            workers: record.workers,
            loadGame: this.loadGame,
            chunkSize: this.chunkSize,
            yieldToEventLoop: this.yieldToEventLoop,
            signal: record.abortController.signal,
            workerEntryUrl: this.workerEntryUrl,
            onProgress: (roundsCompleted) => {
                record.roundsCompleted = roundsCompleted;
                record.durationMs = this.now() - record.startedAt;
            },
        });

        let result;
        try {
            result = await runner.run();
        } catch (error) {
            if (error instanceof SimulationCancelledError) {
                this.cancelRecord(record);
                return;
            }
            this.fail(record, error);
            return;
        }

        const report: SimulationReport = this.reportBuilder.build({
            manifest: result.manifest,
            requestedRounds: record.rounds,
            seed: record.seed,
            statistics: result.statistics,
            durationMs: record.durationMs,
            packageRoot: record.projectRoot,
            breakdown: result.breakdown,
            workers: result.workers,
            workerSeedStrategy: result.workerSeedStrategy,
        });

        record.status = "completed";
        record.report = report;
        record.statistics = {
            volatility: result.statistics.volatility,
            payoutStandardDeviation: result.statistics.payoutStandardDeviation,
            returnStandardDeviation: result.statistics.returnStandardDeviation,
            averagePayoutConfidenceInterval95: result.statistics.averagePayoutConfidenceInterval95,
            rtpConfidenceInterval95: result.statistics.rtpConfidenceInterval95,
            payoutHistogram: result.statistics.payoutHistogram,
        };
        this.markTerminal(record);
    }

    private fail(record: StudioSimulationJobRecord, error: unknown): void {
        record.status = "failed";
        record.error = error instanceof Error ? error.message : String(error);
        this.markTerminal(record);
    }

    private cancelRecord(record: StudioSimulationJobRecord): void {
        record.status = "cancelled";
        this.markTerminal(record);
    }

    // Common tail for every path that lands a record in a terminal status: stamps durationMs/
    // completedAt, then re-saves through the repository specifically so it gets a chance to enforce
    // retention (see StudioSimulationRepository.save()'s own doc comment) — every other mutation in
    // this class updates `record` in place without a second save() call, since the repository stores
    // it by reference; this one call is the deliberate exception.
    private markTerminal(record: StudioSimulationJobRecord): void {
        record.durationMs = this.now() - record.startedAt;
        record.completedAt = record.startedAt + record.durationMs;
        this.repository.save(record);
    }
}
