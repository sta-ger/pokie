import {releaseSimulationGame} from "../../../src/simulation/parallel/internal/releaseSimulationGame.js";
import {collectPokieWasmSimulation} from "../../../src/wasm/PokieWasmCommands.js";
import {artifactAnalyticsObservation} from "../../../src/simulation/artifactAnalyticsObservation.js";
import {
    SimulationAccumulator,
    describeOutcomeSourceSeedPolicy,
    describeUnavailableArtifactOperation,
    readCanonicalWasmDeclaration,
    isWasmComponentFile,
    loadPokieWasmFileRuntime,
    loadPokieGame,
    isSimulationReportSet,
    SimulationReportSet,
    OUTCOME_SOURCE_SIMULATE_OPERATION,
    OutcomeLibraryBundleOutcomeSource,
    OutcomeLibraryBundleReader,
    OutcomeLibraryBundleReading,
    ParallelSimulationRunner,
    ParallelSimulationRunOptions,
    PreGeneratedRoundReplayDescriptor,
    PokieGameManifest,
    PokieProject,
    resolveOutcomeLibraryModeName,
    SecureWeightedOutcomeRandomSource,
    SeededWeightedOutcomeRandomSource,
    SeededPokieWasmHost,
    SimulationCancelledError,
    SimulationReport,
    SimulationReportBuilder,
    SimulationReportBuilding,
    WeightedOutcomeRandomSource,
} from "@fromstan/pokie";
import crypto from "crypto";
import {deriveDeterministicSeed} from "../../../src/pregenerated/internal/deriveDeterministicSeed.js";
import {canonicalStudioProjectIdentity} from "../jobs/canonicalStudioProjectIdentity.js";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../../materialize/materializeRuntimePackage.js";
import {InMemoryStudioSimulationRepository} from "./InMemoryStudioSimulationRepository.js";
import type {StudioSimulationJobRecord} from "./StudioSimulationJobRecord.js";
import type {StudioSimulationJobView, StudioSimulationStatisticsView} from "./StudioSimulationJobView.js";
import type {StudioSimulationRepository} from "./StudioSimulationRepository.js";
import type {StudioSimulationReportListEntry} from "./StudioSimulationReportListEntry.js";
import type {StudioSimulationStatus} from "./StudioSimulationStatus.js";
import {toStudioSimulationJobView} from "./toStudioSimulationJobView.js";
import {validateSimulationConvergence, type ValidatedSimulationRequest} from "./validateSimulationRequest.js";
import {StudioJobService} from "../jobs/StudioJobService.js";
import type {StudioJobView} from "../jobs/StudioJobView.js";

const DEFAULT_CHUNK_SIZE = 1000;

export type StudioSimulationStartResult =
    | {status: "created"; job: StudioSimulationJobView}
    | {status: "conflict"; activeJobId: string}
    | {status: "unsupported"; message: string};

export type GetSimulationReportResult =
    | {status: "ok"; report: SimulationReport | SimulationReportSet; statistics?: StudioSimulationStatisticsView}
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
    private readonly activeExecutions = new Set<string>();
    private readonly pendingTerminals = new Map<string, StudioSimulationJobRecord["status"]>();
    private readonly executionFailures: unknown[] = [];
    private readonly pendingExecutions = new Set<Promise<void>>();
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
    private readonly onCompleted: (record: StudioSimulationJobRecord) => void;
    private readonly pokieVersion: string | undefined;
    private readonly loadWasmRuntime: typeof loadPokieWasmFileRuntime;
    private jobService: StudioJobService | undefined;

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
        onCompleted: (record: StudioSimulationJobRecord) => void = () => undefined,
        pokieVersion: string | undefined = undefined,
        loadWasmRuntime: typeof loadPokieWasmFileRuntime = loadPokieWasmFileRuntime,
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
        this.onCompleted = onCompleted;
        this.pokieVersion = pokieVersion;
        this.loadWasmRuntime = loadWasmRuntime;
    }

    public attachJobService(jobService: StudioJobService): void {
        this.jobService = jobService;
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
        projectRoot = canonicalStudioProjectIdentity(projectRoot);
        request = {...request, convergence: validateSimulationConvergence(request.convergence)};
        // Reject unsupported declarations upfront; acquisition owns current-byte
        // integrity failures and retains them as failed jobs. A .wasm directory
        // remains an ordinary package, including for direct service callers.
        if (isWasmComponentFile(projectRoot)) {
            const declaration = readCanonicalWasmDeclaration(projectRoot, "simulate game rounds");
            if (!declaration.supported) return {status: "unsupported", message: declaration.message};
            if (!declaration.manifest.capabilities.includes("runtime.play") || (request.workers ?? 1) !== 1) {
                return {status: "unsupported", message: "WASM simulation requires runtime.play, one Worker and a fixed round budget. Rebuild with play support and set workers to 1."};
            }
        }
        if (request.convergence && (outcomeSourceProject !== undefined || isWasmComponentFile(projectRoot))) {
            return {status: "unsupported", message: "Adaptive stopping is supported only for executable package simulations; outcome-library and WASM samplers use fixed budgets."};
        }
        const common = this.jobService?.start({
            projectId: projectRoot,
            operation: "simulation",
            request: {rounds: request.rounds, ...(request.seed === undefined ? {} : {seed: request.seed}), workers: request.workers ?? 1, ...(request.convergence ? {convergence: request.convergence} : {}), ...(request.modeName === undefined ? {} : {modeName: request.modeName})},
            conflictKey: `simulation:${projectRoot}`,
            recoveryOnRestart: {action: "retry", reason: "A simulation cannot safely resume after Studio restarts. Run it again with these captured parameters."},
        });
        if (common?.status === "conflict") return {status: "conflict", activeJobId: common.activeJobId};
        if (common?.status === "reattached") {
            const existing = this.repository.get(common.job.id);
            return {status: "created", job: existing === undefined ? this.projectDurableJob(common.job) : this.toJobView(existing)};
        }
        const active = this.repository.findActiveByProjectRoot(projectRoot);
        if (active) {
            if (common?.status === "created") this.jobService?.cancelled(common.job.id, {summary: "Simulation was already active in its compatibility executor."});
            return {status: "conflict", activeJobId: active.id};
        }

        const record: StudioSimulationJobRecord = {
            id: common?.status === "created" ? common.job.id : this.createId(),
            projectRoot,
            status: "queued",
            rounds: request.rounds,
            seed: request.seed,
            workers: request.workers ?? 1,
            convergence: request.convergence,
            phase: "queued",
            startedAt: this.now(),
            roundsCompleted: 0,
            durationMs: 0,
            abortController: new AbortController(),
            outcomeSourceProject,
            modeName: request.modeName,
        };
        this.repository.save(record);
        // Deferred via a promise microtask rather than called directly: run() sets record.status to
        // "running" before its own first await (calling createParallelSimulationRunner/.run()
        // synchronously starts that work), so calling it inline here would let that synchronous
        // prefix flip the status before this function's own `return` below runs — a caller polling
        // status right after POST would then never observe "queued" at all. Queuing it instead
        // guarantees run() doesn't execute until after start() has already returned.
        this.activeExecutions.add(record.id);
        const execution = Promise.resolve().then(() => this.run(record))
            .catch((error: unknown) => this.failExecution(record, error))
            .then(() => this.publishPendingTerminal(record));
        this.trackExecution(execution);

        return {status: "created", job: this.toJobView(record)};
    }

    public getStatus(id: string): StudioSimulationJobView | undefined {
        const record = this.repository.get(id);
        return record ? this.toJobView(record) : undefined;
    }

    // The project-scoped counterpart used by Studio's HTTP surface.  The service's unscoped
    // getStatus() remains useful to its own process-level lifecycle tests and diagnostics, but a
    // browser request is always made in the context of one canonical Project.  Treat an id from a
    // different Project exactly like an unknown one so neither its run state nor its safe error text
    // can leak when the user switches Projects.
    public getStatusForProject(projectRoot: string, id: string): StudioSimulationJobView | undefined {
        projectRoot = canonicalStudioProjectIdentity(projectRoot);
        const record = this.repository.get(id);
        if (record?.projectRoot === projectRoot) return this.toJobView(record);
        const common = this.jobService?.get(projectRoot, id);
        return common?.operation === "simulation" ? this.projectDurableJob(common) : undefined;
    }

    // Idempotent: cancelling an already-terminal job is a no-op that still returns its (unchanged)
    // current view rather than an error — same "repeated request can't corrupt state" guarantee as
    // start(). Returns undefined only when `id` itself is unknown.
    public cancel(id: string): StudioSimulationJobView | undefined {
        const record = this.repository.get(id);
        if (!record) {
            return undefined;
        }
        this.cancelActiveRecord(record);
        return this.toJobView(record);
    }

    // Same Project identity boundary as getStatusForProject().  In particular, a stale Cancel
    // request from Project A must never cancel a coincidentally-known job after Studio has moved to
    // Project B.
    public cancelForProject(projectRoot: string, id: string): StudioSimulationJobView | undefined {
        projectRoot = canonicalStudioProjectIdentity(projectRoot);
        const record = this.repository.get(id);
        if (!record || record.projectRoot !== projectRoot) {
            const common = this.jobService?.cancel(projectRoot, id);
            return common?.operation === "simulation" ? this.projectDurableJob(common) : undefined;
        }
        this.cancelActiveRecord(record);
        return this.toJobView(record);
    }

    // Best-effort: aborts every currently active job — called from StudioServer.stop() so a stopped
    // Studio process never leaves a simulation (or its worker threads) running against an event loop
    // nobody is serving HTTP requests on anymore.
    public async cancelAll(): Promise<void> {
        for (const record of this.repository.listActive()) {
            this.cancelActiveRecord(record);
        }
        await Promise.allSettled([...this.pendingExecutions]);
        if (this.executionFailures.length > 0) throw this.executionFailures[0];
    }

    // Same reasoning as cancelAll(), scoped to one project — called from StudioServer whenever Studio
    // switches away from `projectRoot` (a different project opened, or back to Home), so a simulation
    // for the project just left doesn't keep running (or keep its worker threads alive) unseen and
    // unreachable (its own job/report becomes unreachable through this project's own routes the
    // moment the switch happens anyway — see getReport()/listReports()'s own projectRoot scoping — so
    // leaving it running would only waste CPU, never remain usable). A no-op when nothing is active
    // for that project.
    public cancelActiveForProject(projectRoot: string): void {
        projectRoot = canonicalStudioProjectIdentity(projectRoot);
        const record = this.repository.findActiveByProjectRoot(projectRoot);
        if (record) this.cancelActiveRecord(record);
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
        projectRoot = canonicalStudioProjectIdentity(projectRoot);
        const entries = new Map<string, StudioSimulationReportListEntry>();
        for (const record of this.repository.listTerminalByProjectRoot(projectRoot)) {
            const entry = this.toReportListEntry(record);
            if (entry) {
                entries.set(entry.id, entry);
            }
        }
        // The compatibility repository is intentionally process-local.  A
        // retained common job therefore becomes the authoritative projection
        // after restart, including the report needed by the old Reports URL.
        for (const job of this.jobService?.list(projectRoot) ?? []) {
            const entry = this.reportListEntryFromDurableJob(job);
            if (entry !== undefined && !entries.has(entry.id)) entries.set(entry.id, entry);
        }
        return Array.from(entries.values());
    }

    // "not-found" covers both a genuinely unknown id AND an id that belongs to a different project —
    // deliberately indistinguishable from the caller's perspective, so this can never be used to probe
    // whether some other project has a simulation with a given id.
    public getReport(projectRoot: string, id: string): GetSimulationReportResult {
        projectRoot = canonicalStudioProjectIdentity(projectRoot);
        const record = this.repository.get(id);
        if (record?.projectRoot === projectRoot) {
            if (record.status !== "completed" || this.activeExecutions.has(id) || !record.report) return {status: "not-ready", jobStatus: record.status};
            return {status: "ok", report: record.report, statistics: record.statistics};
        }
        const job = this.jobService?.get(projectRoot, id);
        if (job?.operation !== "simulation") return {status: "not-found"};
        const report = reportFromDurableDetail(job);
        if (job.status !== "completed" || report === undefined) return {status: "not-ready", jobStatus: job.status};
        return {status: "ok", report, statistics: statisticsFromDurableDetail(job)};
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
            convergence: record.convergence,
            modes: isSimulationReportSet(report) ? Object.fromEntries(Object.entries(report.modes).map(([id, mode]) => [id, {rounds: mode.rounds, betMode: mode.betMode}])) : undefined,
            actualRounds: isSimulationReportSet(report) ? undefined : report.rounds,
            ...(!isSimulationReportSet(report) && report.sampling ? {sampling: report.sampling} : {}),
            seed: record.seed,
            workers: report.workers ?? record.workers,
            rtp: isSimulationReportSet(report) ? undefined : report.rtp,
            hitFrequency: isSimulationReportSet(report) ? undefined : report.hitFrequency,
            maxWin: isSimulationReportSet(report) ? undefined : report.maxWin,
            startedAt: new Date(record.startedAt).toISOString(),
            completedAt: new Date(record.completedAt ?? record.startedAt).toISOString(),
            durationMs: record.durationMs,
            hasWarnings: (isSimulationReportSet(report) ? Object.values(report.modes).some(mode => (mode.warnings?.length ?? 0) > 0) : (report.warnings?.length ?? 0) > 0),
            modeName: record.modeName,
        };
    }

    private async run(record: StudioSimulationJobRecord): Promise<void> {
        this.setPhase(record, "preparing");
        if (record.outcomeSourceProject !== undefined) {
            await this.runOutcomeSourceSampling(record, record.outcomeSourceProject);
            return;
        }

        if (isWasmComponentFile(record.projectRoot)) {
            await this.runWasmSimulation(record);
            return;
        }

        if (record.abortController.signal.aborted) {
            this.cancelRecord(record);
            return;
        }
        this.markRunning(record);

        let runtime;
        try {
            runtime = await this.resolveRuntimePackageRoot(record.projectRoot, {signal: record.abortController.signal});
        } catch (error) {
            if (record.abortController.signal.aborted) this.cancelRecord(record);
            else this.fail(record, this.describeRuntimePreparationFailure(error));
            return;
        }

        try {
            let declaredModes;
            if (record.modeName !== undefined) {
                const game = await this.loadGame(runtime.runtimePath);
                try {
                    declaredModes = game.getBetModes?.();
                } finally {
                    await releaseSimulationGame(game);
                }
                if (record.modeName === "all" && !declaredModes?.length) throw new Error('All-mode simulation requires declared executable bet modes.');
                if (record.modeName !== "all" && !declaredModes?.some(mode => mode.id === record.modeName)) throw new Error(`Unknown bet mode "${record.modeName}".`);
            }
            const modeIds = record.modeName === "all" ? declaredModes!.map(mode => mode.id) : [record.modeName];
            const reports: Record<string, SimulationReport> = {};
            let completedRounds = 0;
            record.modeCount = modeIds.length;
            for (const modeId of modeIds) {
                if (record.abortController.signal.aborted) throw new SimulationCancelledError();
                const modeStartedAt = record.modeName === "all" ? this.now() : record.startedAt;
                const runner = this.createParallelSimulationRunner(runtime.runtimePath, record.rounds, {
                    seed: record.seed,
                    convergence: record.convergence,
                    onPhase: phase => this.setPhase(record, phase),
                    betModeId: modeId,
                    workers: record.workers,
                    loadGame: this.loadGame,
                    chunkSize: this.chunkSize,
                    yieldToEventLoop: this.yieldToEventLoop,
                    signal: record.abortController.signal,
                    workerEntryUrl: this.workerEntryUrl,
                    onProgress: (roundsCompleted) => {
                        record.roundsCompleted = completedRounds + roundsCompleted;
                        record.durationMs = this.now() - record.startedAt;
                        this.setPhase(record, "simulation");
                    },
                });
                const result = await runner.run();

                // The runner is the authority on both the final number of rounds and why it stopped.
                // Capture its final duration before building the immutable report: the last progress
                // callback can precede runner cleanup, so using its older value made a completed
                // one-chunk run look instantaneous and dropped adaptive-stop metadata in Studio.
                const finalRoundsCompleted = result.statistics.rounds;
                const finalDurationMs = this.now() - modeStartedAt;
                Object.assign(record, {roundsCompleted: completedRounds + finalRoundsCompleted, durationMs: finalDurationMs});

                const report: SimulationReport = this.reportBuilder.build({
                    manifest: result.manifest,
                    requestedRounds: record.rounds,
                    seed: record.seed,
                    statistics: result.statistics,
                    durationMs: finalDurationMs,
                    packageRoot: record.projectRoot,
                    configHash: result.configHash,
                    pokieVersion: this.pokieVersion,
                    breakdown: result.breakdown,
                    jackpot: result.jackpot,
                    betMode: result.betMode,
                    targetRtp: declaredModes?.find(mode => mode.id === modeId)?.targetRtp,
                    workers: result.workers,
                    workerSeedStrategy: result.workerSeedStrategy,
                    stopReason: result.stopReason,
                    convergence: result.convergence,
                });

                if (record.abortController.signal.aborted) throw new SimulationCancelledError();
                if (modeId !== undefined) Reflect.defineProperty(reports, modeId, {value: report, enumerable: true});
                record.report = report;
                const metrics = result.statistics.logicalRoundMetrics ?? result.statistics;
                record.statistics = {
                    analytics: result.statistics.analytics,
                    volatility: metrics.volatility,
                    payoutStandardDeviation: metrics.payoutStandardDeviation,
                    returnStandardDeviation: metrics.returnStandardDeviation,
                    averagePayoutConfidenceInterval95: metrics.averagePayoutConfidenceInterval95,
                    rtpConfidenceInterval95: metrics.rtpConfidenceInterval95,
                    payoutHistogram: metrics.payoutHistogram,
                };
                completedRounds += result.statistics.rounds;
            }
            if (record.modeName === "all") {
                const first = Object.values(reports)[0];
                record.report = {game: first.game, requestedRounds: record.rounds, seed: first.seed, workers: first.workers, modes: reports};
                Reflect.deleteProperty(record, "statistics");
            }
            record.status = "completed";
            this.markTerminal(record);
        } catch (error) {
            if (error instanceof Error && "observedPrefix" in error) Object.assign(record, {observedPrefix: error.observedPrefix});
            if (error instanceof SimulationCancelledError) {
                Object.assign(record, {observedPrefix: error.observedPrefix});
                this.cancelRecord(record);
                return;
            }
            this.fail(record, error);
        } finally {
            try {
                this.setPhase(record, "finalizing / cleanup");
            } finally {
                await runtime.release();
            }
        }
    }

    /** Runs canonical WASM in-process: portable components have no Node worker loader. */
    private async runWasmSimulation(record: StudioSimulationJobRecord): Promise<void> {
        if (record.abortController.signal.aborted) {
            this.cancelRecord(record);
            return;
        }
        this.markRunning(record);
        const seed = record.seed ?? crypto.randomUUID();
        let runtime;
        try {
            runtime = await this.loadWasmRuntime(record.projectRoot, new SeededPokieWasmHost(seed));
            const results = await collectPokieWasmSimulation(runtime, seed, record.rounds, {
                mode: record.modeName, signal: record.abortController.signal, chunkSize: this.chunkSize, yieldToHost: this.yieldToEventLoop,
                onProgress: (completed, _mode, modeCount, statistics) => {
                    record.roundsCompleted = completed;
                    record.modeCount = modeCount;
                    record.observedPrefix = statistics;
                    record.durationMs = this.now() - record.startedAt;
                    this.setPhase(record, "simulation");
                },
            });
            const reports = results.map(result => this.reportBuilder.build({
                manifest: {id: runtime!.manifest.component.id, name: runtime!.manifest.component.id, version: runtime!.manifest.component.version},
                requestedRounds: record.rounds, ...(record.seed === undefined ? {} : {seed: record.seed}), statistics: result.statistics,
                durationMs: record.durationMs, packageRoot: record.projectRoot, configHash: runtime!.manifest.artifact?.configurationHash,
                workers: 1, workerSeedStrategy: "portable seeded host stream (single in-process WASM runtime)", pokieVersion: this.pokieVersion, betMode: result.mode, targetRtp: result.targetRtp,
            }));
            record.report = record.modeName === "all" ? {game: reports[0].game, requestedRounds: record.rounds, seed, workers: 1, modes: Object.fromEntries(results.map((result, index) => [result.mode!, reports[index]]))} : reports[0];
            const statistics = results[0].statistics;
            if (record.modeName !== "all") record.statistics = {
                analytics: statistics.analytics, volatility: statistics.volatility, payoutStandardDeviation: statistics.payoutStandardDeviation,
                returnStandardDeviation: statistics.returnStandardDeviation, averagePayoutConfidenceInterval95: statistics.averagePayoutConfidenceInterval95,
                rtpConfidenceInterval95: statistics.rtpConfidenceInterval95, payoutHistogram: statistics.payoutHistogram,
            };
            record.status = "completed";
            this.markTerminal(record);
        } catch (error) {
            if (error instanceof SimulationCancelledError) {
                record.observedPrefix = error.observedPrefix;
                this.cancelRecord(record);
            } else if (record.abortController.signal.aborted) this.cancelRecord(record);
            else this.fail(record, error);
        } finally {
            try {
                this.setPhase(record, "finalizing / cleanup");
            } finally {
                await runtime?.dispose();
            }
        }
    }

    private async runOutcomeSourceSampling(record: StudioSimulationJobRecord, project: PokieProject): Promise<void> {
        const diagnostic = describeUnavailableArtifactOperation(project, OUTCOME_SOURCE_SIMULATE_OPERATION);
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
        this.markRunning(record);

        const outcomeSource = new OutcomeLibraryBundleOutcomeSource(project.rootPath, modeName);
        const randomSource: WeightedOutcomeRandomSource = new SecureWeightedOutcomeRandomSource();
        const accumulator = new SimulationAccumulator();
        let lastReplay: PreGeneratedRoundReplayDescriptor | undefined;

        let roundsRemaining = record.rounds;
        try {
            while (roundsRemaining > 0) {
                if (record.abortController.signal.aborted) {
                    record.observedPrefix = accumulator.getStatistics();
                    record.roundsCompleted = record.observedPrefix.rounds;
                    this.cancelRecord(record);
                    return;
                }

                const chunkRounds = Math.min(this.chunkSize, roundsRemaining);
                for (let played = 0; played < chunkRounds; played++) {
                    // A seeded simulation is a collection of independently addressable rounds, not a
                    // mutable seeded stream. This is the same contract Play, the dev server and replay
                    // use, so its final sample can be reproduced with just (seed, round, mode).
                    const replayRound = record.roundsCompleted + played + 1;
                    const roundRandomSource =
                        record.seed === undefined
                            ? randomSource
                            : new SeededWeightedOutcomeRandomSource(deriveDeterministicSeed(record.seed, replayRound));
                    const selection = await outcomeSource.drawOutcome(roundRandomSource);
                    accumulator.addRound(selection.outcome.artifact.stake, selection.outcome.artifact.totalWin, artifactAnalyticsObservation(selection.outcome.artifact, selection.libraryHash));
                    if (record.seed !== undefined) {
                        const artifact = selection.outcome.artifact;
                        lastReplay = {
                            game: manifestGame,
                            libraryId: selection.libraryId,
                            libraryHash: selection.libraryHash,
                            modeName,
                            selectionAlgorithm: "derived-round-seed-v1",
                            seed: record.seed,
                            round: replayRound,
                            outcomeId: selection.outcome.id,
                            weight: selection.outcome.weight,
                            totalWin: artifact.totalWin,
                            payoutMultiplier: artifact.payoutMultiplier,
                            stake: artifact.stake,
                            screen: artifact.screen.map((row) => [...row]),
                            artifact,
                            timestamp: record.startedAt,
                            durationMs: this.now() - record.startedAt,
                        };
                    }
                }

                record.roundsCompleted += chunkRounds;
                record.durationMs = this.now() - record.startedAt;
                this.setPhase(record, "simulation");
                roundsRemaining -= chunkRounds;
                if (roundsRemaining > 0) {
                    await this.yieldToEventLoop();
                }
            }
        } catch (error) {
            record.observedPrefix = accumulator.getStatistics();
            record.roundsCompleted = record.observedPrefix.rounds;
            this.fail(record, error);
            return;
        }

        if (record.abortController.signal.aborted) {
            record.observedPrefix = accumulator.getStatistics();
            this.cancelRecord(record);
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
            workerSeedStrategy: describeOutcomeSourceSeedPolicy(record.seed),
            betMode: modeName,
            stopReason: "maxRounds",
            configHash: statistics.analytics?.envelope.modelId ?? undefined,
            pokieVersion: this.pokieVersion,
        });

        record.status = "completed";
        record.report = report;
        record.statistics = {
            analytics: statistics.analytics,
            volatility: statistics.volatility,
            payoutStandardDeviation: statistics.payoutStandardDeviation,
            returnStandardDeviation: statistics.returnStandardDeviation,
            averagePayoutConfidenceInterval95: statistics.averagePayoutConfidenceInterval95,
            rtpConfidenceInterval95: statistics.rtpConfidenceInterval95,
            payoutHistogram: statistics.payoutHistogram,
        };
        record.lastReplay = lastReplay;
        this.markTerminal(record);
    }

    // A rejected runtime release is not a successful job, even after the
    // computation finished. Retain the error for shutdown so no graceful
    // marker can claim that these resources were drained.
    private failExecution(record: StudioSimulationJobRecord, error: unknown): void {
        this.executionFailures.push(error);
        this.fail(record, new Error(`Simulation cleanup could not be confirmed: ${error instanceof Error ? error.message : String(error)}. Inspect retained resources and restart Studio before retrying.`));
    }

    private trackExecution(execution: Promise<void>): void {
        this.pendingExecutions.add(execution);
        execution.then(
            () => this.pendingExecutions.delete(execution),
            (error: unknown) => {
                this.executionFailures.push(error);
                this.pendingExecutions.delete(execution);
            },
        );
    }

    private fail(record: StudioSimulationJobRecord, error: unknown): void {
        // Failed computation or cleanup invalidates every staged success output.
        Reflect.deleteProperty(record, "report");
        Reflect.deleteProperty(record, "statistics");
        Reflect.deleteProperty(record, "lastReplay");
        record.status = "failed";
        record.error = error instanceof Error ? error.message : String(error);
        this.markTerminal(record);
    }

    // Planner diagnostics are already safe, user-facing explanations of the
    // attempted runtime path, failed edge, and recovery. Preserve them byte
    // for byte: the client deliberately recognizes their opening phrase and
    // would otherwise replace them with generic retry copy.
    private describeRuntimePreparationFailure(error: unknown): Error {
        if (error instanceof Error && (/^Cannot prepare a runnable runtime\b/i).test(error.message)) {
            return error;
        }
        return error instanceof Error ? error : new Error(String(error));
    }

    private cancelRecord(record: StudioSimulationJobRecord): void {
        Reflect.deleteProperty(record, "report");
        Reflect.deleteProperty(record, "statistics");
        Reflect.deleteProperty(record, "lastReplay");
        record.status = "cancelled";
        this.markTerminal(record);
    }

    // A queued canonical component has no runtime/session resource to release, so it can become
    // terminal immediately. Other project kinds may own temporary materialization stages while
    // queued; their run path continues to publish cancellation after it has cleaned those stages.
    private cancelActiveRecord(record: StudioSimulationJobRecord): void {
        if (record.status !== "queued" && record.status !== "running" && record.status !== "cancelling") return;
        // Persist cancelling before asking the compatibility executor to
        // release its runtime/worker resources. The terminal state is written
        // only by markTerminal() after that cleanup has completed.
        this.jobService?.cancel(record.projectRoot, record.id);
        // This compatibility record has no durable executor after the
        // process exits. Its run promise owns terminal cancellation after
        // cleanup; keeping the local record cancellable preserves the existing cleanup
        // and Retry contracts.
        const wasQueued = record.status === "queued";
        record.abortController.abort();
        record.status = "cancelling";
        if (wasQueued && isWasmComponentFile(record.projectRoot)) this.cancelRecord(record);
    }

    // Common tail for every path that lands a record in a terminal status: stamps durationMs/
    // completedAt, then re-saves through the repository specifically so it gets a chance to enforce
    // retention (see StudioSimulationRepository.save()'s own doc comment) — every other mutation in
    // this class updates `record` in place without a second save() call, since the repository stores
    // it by reference; this one call is the deliberate exception.
    private markTerminal(record: StudioSimulationJobRecord): void {
        if (this.activeExecutions.has(record.id)) {
            // The repository retains this object by reference. Keep both its
            // public status and durable terminal pending through runtime release.
            this.pendingTerminals.set(record.id, record.status);
            record.status = record.abortController.signal.aborted ? "cancelling" : "running";
            this.setPhase(record, "finalizing / cleanup");
            return;
        }
        this.setPhase(record, record.status);
        record.durationMs = this.now() - record.startedAt;
        record.completedAt = record.startedAt + record.durationMs;
        if (record.status === "completed" && record.report !== undefined && !isSimulationReportSet(record.report)) {
            // The downloadable report and completion hook consume the drained
            // terminal, including time spent releasing the materialized runtime.
            record.report = {...record.report, durationMs: record.durationMs, spinsPerSecond: Math.round((record.report.sampling?.acceptedSubrounds ?? record.report.rounds) / (Math.max(record.durationMs, 1) / 1000))};
        }
        this.repository.save(record);
        if (record.status === "completed") {
            this.jobService?.complete(record.id, {
                summary: "Simulation completed.",
                outputs: [{label: "Simulation report", downloadPath: `/api/project/reports/${encodeURIComponent(record.id)}/download?format=json`}],
                provenance: {simulationId: record.id, projectRoot: record.projectRoot},
                detail: {simulationId: record.id, rounds: record.roundsCompleted, report: record.report, statistics: record.statistics, observedPrefix: record.observedPrefix},
            });
        } else if (record.status === "cancelled") {
            this.jobService?.cancelled(record.id, {summary: "Simulation cancelled after the observed accepted prefix.", provenance: {simulationId: record.id, projectRoot: record.projectRoot}, detail: {simulationId: record.id, rounds: record.roundsCompleted, observedPrefix: record.observedPrefix}}, {action: "retry", reason: "Run the simulation again with the captured parameters."});
        } else if (record.status === "failed") {
            this.jobService?.fail(record.id, record.error ?? "Simulation failed.", {action: "retry", reason: record.error ?? "Correct the reported problem and run the simulation again."}, record.observedPrefix ? {summary: "Simulation failed after the observed accepted prefix.", detail: {simulationId: record.id, rounds: record.observedPrefix.rounds, observedPrefix: record.observedPrefix}} : undefined);
        }
    }

    private publishPendingTerminal(record: StudioSimulationJobRecord): void {
        this.activeExecutions.delete(record.id);
        const terminal = this.pendingTerminals.get(record.id);
        this.pendingTerminals.delete(record.id);
        if (terminal !== undefined) {
            // Cancel remains actionable while release is pending, even if
            // computation already staged a successful report. Cleanup failure
            // takes precedence over cancellation because drainage is unproven.
            if (terminal !== "failed" && record.abortController.signal.aborted) this.cancelRecord(record);
            else {
                record.status = terminal;
                this.markTerminal(record);
            }
        }
        // Only a successfully drained terminal can notify output consumers.
        if (record.status === "completed") this.onCompleted(record);
    }

    private markRunning(record: StudioSimulationJobRecord): void {
        record.status = "running";
        this.jobService?.markRunning(record.id);
        this.setPhase(record, "preparing");
    }

    private setPhase(record: StudioSimulationJobRecord, stage: string): void {
        record.phase = stage;
        record.durationMs = this.now() - record.startedAt;
        this.jobService?.progress(record.id, {stage, unit: "accepted plays", current: record.roundsCompleted, total: record.rounds * (record.modeCount ?? 1)});
    }

    /** Compatibility DTO projection of the durable lifecycle authority. */
    private toJobView(record: StudioSimulationJobRecord): StudioSimulationJobView {
        if (record.completedAt === undefined) record.durationMs = this.now() - record.startedAt;
        const view = toStudioSimulationJobView(record);
        const common = this.jobService?.get(record.projectRoot, record.id);
        if (common?.operation !== "simulation") return view;
        return {
            ...view,
            status: common.status,
            progress: common.progress ?? view.progress,
            ...(common.startedAt === undefined ? {} : {startedAt: new Date(common.startedAt).toISOString()}),
            ...(common.durationMs === undefined ? {} : {durationMs: common.durationMs}),
            ...(common.error === undefined ? {} : {error: common.error}),
            ...(common.recovery === undefined ? {} : {recovery: common.recovery}),
        };
    }

    private projectDurableJob(job: StudioJobView): StudioSimulationJobView {
        return {
            id: job.id,
            status: job.status,
            progress: job.progress,
            ...(job.request.convergence ? {convergence: job.request.convergence as StudioSimulationJobView["convergence"]} : {}),
            requestedRounds: typeof job.request.rounds === "number" ? job.request.rounds : 0,
            rounds: (typeof job.progress?.total === "number" ? job.progress.total : undefined) ?? (typeof job.request.rounds === "number" ? job.request.rounds : 0),
            ...(typeof job.request.seed === "string" ? {seed: job.request.seed} : {}),
            workers: typeof job.request.workers === "number" ? job.request.workers : 1,
            ...(typeof job.request.modeName === "string" ? {modeName: job.request.modeName} : {}),
            startedAt: new Date(job.startedAt ?? job.createdAt).toISOString(),
            roundsCompleted: typeof job.progress?.current === "number" ? job.progress.current : Number(job.progress?.current ?? 0),
            durationMs: job.durationMs ?? 0,
            ...(reportFromDurableDetail(job) === undefined ? {} : {report: reportFromDurableDetail(job)}),
            ...(statisticsFromDurableDetail(job) === undefined ? {} : {statistics: statisticsFromDurableDetail(job)}),
            ...(durableDetail(job)?.observedPrefix ? {observedPrefix: durableDetail(job)!.observedPrefix as import("../../../src/simulation/SimulationStatistics.js").SimulationStatistics} : {}),
            ...(job.error === undefined ? {} : {error: job.error}),
            ...(job.recovery === undefined ? {} : {recovery: job.recovery}),
        };
    }

    private reportListEntryFromDurableJob(job: StudioJobView): StudioSimulationReportListEntry | undefined {
        if (job.operation !== "simulation" || job.status !== "completed") return undefined;
        const report = reportFromDurableDetail(job);
        if (report === undefined) return undefined;
        return {
            id: job.id,
            status: "completed",
            game: {id: report.game.id, version: report.game.version},
            requestedRounds: report.requestedRounds,
            ...(job.request.convergence ? {convergence: job.request.convergence as StudioSimulationJobView["convergence"]} : {}),
            modes: isSimulationReportSet(report) ? Object.fromEntries(Object.entries(report.modes).map(([id, mode]) => [id, {rounds: mode.rounds, betMode: mode.betMode}])) : undefined,
            actualRounds: isSimulationReportSet(report) ? undefined : report.rounds,
            ...(!isSimulationReportSet(report) && report.sampling ? {sampling: report.sampling} : {}),
            ...(typeof job.request.seed === "string" ? {seed: job.request.seed} : {}),
            workers: report.workers ?? (typeof job.request.workers === "number" ? job.request.workers : 1),
            rtp: isSimulationReportSet(report) ? undefined : report.rtp,
            hitFrequency: isSimulationReportSet(report) ? undefined : report.hitFrequency,
            maxWin: isSimulationReportSet(report) ? undefined : report.maxWin,
            startedAt: new Date(job.startedAt ?? job.createdAt).toISOString(),
            completedAt: new Date(job.completedAt ?? job.createdAt).toISOString(),
            durationMs: job.durationMs ?? 0,
            hasWarnings: (isSimulationReportSet(report) ? Object.values(report.modes).some(mode => (mode.warnings?.length ?? 0) > 0) : (report.warnings?.length ?? 0) > 0),
            ...(typeof job.request.modeName === "string" ? {modeName: job.request.modeName} : {}),
        };
    }
}

function durableDetail(job: StudioJobView): Readonly<Record<string, unknown>> | undefined {
    return job.result?.detail !== undefined && typeof job.result.detail === "object" ? job.result.detail : undefined;
}

function reportFromDurableDetail(job: StudioJobView): SimulationReport | SimulationReportSet | undefined {
    if (job.status !== "completed") return undefined;
    const report = durableDetail(job)?.report;
    return typeof report === "object" && report !== null && "game" in report && ("rounds" in report || "modes" in report) ? report as SimulationReport | SimulationReportSet : undefined;
}

function statisticsFromDurableDetail(job: StudioJobView): StudioSimulationStatisticsView | undefined {
    if (job.status !== "completed") return undefined;
    const statistics = durableDetail(job)?.statistics;
    return typeof statistics === "object" && statistics !== null ? statistics as StudioSimulationStatisticsView : undefined;
}
