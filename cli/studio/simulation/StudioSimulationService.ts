import {
    describeUnsupportedProjectOperation,
    loadPokieGame,
    OUTCOME_SOURCE_SIMULATE_OPERATION,
    OutcomeLibraryBundleOutcomeSource,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    ParallelSimulationRunner,
    ParallelSimulationRunOptions,
    PokieGameManifest,
    PokieProject,
    resolveOutcomeLibraryModeName,
    SecureWeightedOutcomeRandomSource,
    SeededWeightedOutcomeRandomSource,
    SimulationAccumulator,
    SimulationCancelledError,
    SimulationReport,
    SimulationReportBuilder,
    SimulationReportBuilding,
    WeightedOutcomeRandomSource,
} from "pokie";
import crypto from "crypto";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../../materialize/materializeRuntimePackage.js";
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
    // Reads a resolved "outcomeLibrary"/"stakeAdapter" project's own bundle manifest -- see start()'s
    // own `outcomeSourceProject` parameter for why this service never resolves a project's type itself.
    private readonly outcomeLibraryReader: OutcomeLibraryBundleReading;
    // A parallel simulation's worker processes can only load a package path, not reuse this
    // process's loadGame callback. Resolve a Blueprint before constructing the runner so both the
    // in-process and worker-thread paths receive the current materialized runtime rather than the
    // Blueprint source path itself.
    private readonly resolveRuntimePackageRoot: RuntimePackageResolving;

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
        outcomeLibraryReader: OutcomeLibraryBundleReading = new OutcomeLibraryBundleReader(),
        resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
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
        this.outcomeLibraryReader = outcomeLibraryReader;
        this.resolveRuntimePackageRoot = resolveRuntimePackageRoot;
    }

    // Returns immediately with a "queued" job — the actual simulation runs in the background (see
    // run()), never blocking the caller (StudioServer's POST handler). Rejects with a conflict
    // instead of creating a second job when one is already queued/running for this projectRoot, so a
    // duplicate/retried request can never corrupt (or race against) the job already in flight.
    //
    // `outcomeSourceProject`, when given, is the already-resolved "outcomeLibrary"/"stakeAdapter"
    // PokieProject StudioServer's own ProjectDashboardContext resolved when it opened `projectRoot` (see
    // StudioServer's own "outcome-source" dashboard status) -- this service deliberately never re-resolves
    // `projectRoot`'s own type itself (that would mean every ordinary "tsPackage"/"blueprint" simulation
    // paid for a redundant filesystem resolution it never needed), the same "caller already knows, pass it
    // through" convention handleOutcomeSourceSample already uses for the sample route. Undefined here means
    // "run the ordinary ParallelSimulationRunner path" (see run()), exactly as before this parameter existed.
    public start(projectRoot: string, request: ValidatedSimulationRequest, outcomeSourceProject?: PokieProject): StudioSimulationStartResult {
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
            outcomeSourceProject,
            modeName: request.modeName,
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

    // The project-scoped counterpart used by Studio's HTTP surface.  The service's unscoped
    // getStatus() remains useful to its own process-level lifecycle tests and diagnostics, but a
    // browser request is always made in the context of one canonical Project.  Treat an id from a
    // different Project exactly like an unknown one so neither its run state nor its safe error text
    // can leak when the user switches Projects.
    public getStatusForProject(projectRoot: string, id: string): StudioSimulationJobView | undefined {
        const record = this.repository.get(id);
        if (!record || record.projectRoot !== projectRoot) {
            return undefined;
        }
        return toStudioSimulationJobView(record);
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

    // Same Project identity boundary as getStatusForProject().  In particular, a stale Cancel
    // request from Project A must never cancel a coincidentally-known job after Studio has moved to
    // Project B.
    public cancelForProject(projectRoot: string, id: string): StudioSimulationJobView | undefined {
        const record = this.repository.get(id);
        if (!record || record.projectRoot !== projectRoot) {
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
            modeName: record.modeName,
        };
    }

    private async run(record: StudioSimulationJobRecord): Promise<void> {
        if (record.outcomeSourceProject !== undefined) {
            await this.runOutcomeSourceSampling(record, record.outcomeSourceProject);
            return;
        }

        if (record.abortController.signal.aborted) {
            this.cancelRecord(record);
            return;
        }
        record.status = "running";

        let runtime;
        try {
            runtime = await this.resolveRuntimePackageRoot(record.projectRoot);
        } catch (error) {
            this.fail(record, error);
            return;
        }

        try {
            const runner = this.createParallelSimulationRunner(runtime.runtimePath, record.rounds, {
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
            const result = await runner.run();

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
        } catch (error) {
            if (error instanceof SimulationCancelledError) {
                this.cancelRecord(record);
                return;
            }
            this.fail(record, error);
        } finally {
            await runtime.release().catch(() => undefined);
        }
    }

    // The "outcomeLibrary"/"stakeAdapter" counterpart to run() above -- reached only when start() was
    // given an already-resolved `outcomeSourceProject` (see that parameter's own doc comment). A "stakeAdapter" export has no
    // draw contract of its own (see OUTCOME_SOURCE_SAMPLE_CAPABILITY's own doc comment) and fails here
    // with the same structured capability diagnostic every other POKIE surface gives it, before ever
    // reading a bundle file. A resolved "outcomeLibrary" project samples `record.modeName` -- a real mode
    // from the manifest's own list, resolved via resolveOutcomeLibraryModeName (defaulting to the
    // manifest's own first mode when start() wasn't given one explicitly, same as before Simulation had a
    // mode picker at all) -- through real, independent draws from OutcomeLibraryBundleOutcomeSource -- the
    // exact same selector simulateOutcomeSourceProject/sampleOutcomeSourceProject already draw through --
    // accumulated into an ordinary SimulationAccumulator, chunked and abort-aware exactly like the
    // ParallelSimulationRunner path above, never a freshly regenerated game-model simulation. Always
    // reports `workers: 1` on the built report regardless of what was requested -- sampling here is never
    // split across worker threads the way a "tsPackage" simulation can be. `record.modeName` is
    // overwritten here with the actually-resolved value (even when start() left it undefined), so every
    // terminal job/report/listing carries the real mode this run sampled, never just "whatever the caller
    // happened to ask for".
    private async runOutcomeSourceSampling(record: StudioSimulationJobRecord, project: PokieProject): Promise<void> {
        const diagnostic = describeUnsupportedProjectOperation(project, OUTCOME_SOURCE_SIMULATE_OPERATION);
        if (diagnostic !== undefined) {
            this.fail(record, new Error(diagnostic.message));
            return;
        }

        let modeName: string;
        let manifestGame: PokieGameManifest;
        try {
            const manifest = await this.outcomeLibraryReader.readManifest(project.rootPath);
            if (manifest.modes.length === 0) {
                this.fail(record, new Error(`"${project.rootPath}" has no outcome-library modes to simulate.`));
                return;
            }
            modeName = resolveOutcomeLibraryModeName(manifest.modes, record.modeName);
            manifestGame = manifest.game;
        } catch (error) {
            this.fail(record, error);
            return;
        }
        record.modeName = modeName;

        if (record.abortController.signal.aborted) {
            this.cancelRecord(record);
            return;
        }
        record.status = "running";

        const outcomeSource = new OutcomeLibraryBundleOutcomeSource(project.rootPath, modeName);
        const randomSource: WeightedOutcomeRandomSource =
            record.seed === undefined ? new SecureWeightedOutcomeRandomSource() : new SeededWeightedOutcomeRandomSource(record.seed);
        const accumulator = new SimulationAccumulator();

        let roundsRemaining = record.rounds;
        try {
            while (roundsRemaining > 0) {
                if (record.abortController.signal.aborted) {
                    this.cancelRecord(record);
                    return;
                }

                const chunkRounds = Math.min(this.chunkSize, roundsRemaining);
                for (let played = 0; played < chunkRounds; played++) {
                    const selection = await outcomeSource.drawOutcome(randomSource);
                    accumulator.addRound(selection.outcome.artifact.stake, selection.outcome.artifact.totalWin);
                }

                record.roundsCompleted += chunkRounds;
                record.durationMs = this.now() - record.startedAt;
                roundsRemaining -= chunkRounds;
                if (roundsRemaining > 0) {
                    await this.yieldToEventLoop();
                }
            }
        } catch (error) {
            this.fail(record, error);
            return;
        }

        const statistics = accumulator.getStatistics();
        const report: SimulationReport = this.reportBuilder.build({
            manifest: manifestGame,
            requestedRounds: record.rounds,
            seed: record.seed,
            statistics,
            durationMs: record.durationMs,
            packageRoot: record.projectRoot,
            workers: 1,
        });

        record.status = "completed";
        record.report = report;
        record.statistics = {
            volatility: statistics.volatility,
            payoutStandardDeviation: statistics.payoutStandardDeviation,
            returnStandardDeviation: statistics.returnStandardDeviation,
            averagePayoutConfidenceInterval95: statistics.averagePayoutConfidenceInterval95,
            rtpConfidenceInterval95: statistics.rtpConfidenceInterval95,
            payoutHistogram: statistics.payoutHistogram,
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
