import {
    describeUnavailableArtifactOperation,
    describeWasmLifecycleBoundary,
    hasDeclaredCanonicalWasmArtifact,
    isWasmComponentFile,
    loadPokieWasmFileRuntime,
    loadPokieGame,
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
    SimulationAccumulator,
    SimulationCancelledError,
    SimulationReport,
    SimulationReportBuilder,
    SimulationReportBuilding,
    WeightedOutcomeRandomSource,
} from "pokie";
import crypto from "crypto";
import {deriveDeterministicSeed} from "../../../src/pregenerated/internal/deriveDeterministicSeed.js";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../../materialize/materializeRuntimePackage.js";
import {InMemoryStudioSimulationRepository} from "./InMemoryStudioSimulationRepository.js";
import type {StudioSimulationJobRecord} from "./StudioSimulationJobRecord.js";
import type {StudioSimulationJobView, StudioSimulationStatisticsView} from "./StudioSimulationJobView.js";
import type {StudioSimulationRepository} from "./StudioSimulationRepository.js";
import type {StudioSimulationReportListEntry} from "./StudioSimulationReportListEntry.js";
import type {StudioSimulationStatus} from "./StudioSimulationStatus.js";
import {toStudioSimulationJobView} from "./toStudioSimulationJobView.js";
import type {ValidatedSimulationRequest} from "./validateSimulationRequest.js";
import {StudioJobService} from "../jobs/StudioJobService.js";

const DEFAULT_CHUNK_SIZE = 1000;

export type StudioSimulationStartResult =
    | {status: "created"; job: StudioSimulationJobView}
    | {status: "conflict"; activeJobId: string}
    | {status: "unsupported"; message: string};

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
        // This service is also used directly, outside StudioServer's HTTP
        // guard. A resolved component, or an actual unresolved WASM file, has
        // no runnable branch. A package directory named `game.wasm` remains a
        // normal project and must not be rejected from its pathname alone.
        if (isWasmComponentFile(projectRoot) && !hasDeclaredCanonicalWasmArtifact(projectRoot)) {
            return {status: "unsupported", message: describeWasmLifecycleBoundary(projectRoot, "simulate game rounds")};
        }
        const common = this.jobService?.start({
            projectId: projectRoot,
            operation: "simulation",
            request: {rounds: request.rounds, ...(request.seed === undefined ? {} : {seed: request.seed}), workers: request.workers ?? 1, ...(request.modeName === undefined ? {} : {modeName: request.modeName})},
            conflictKey: `simulation:${projectRoot}`,
            recoveryOnRestart: {action: "retry", reason: "A simulation cannot safely resume after Studio restarts. Run it again with these captured parameters."},
        });
        if (common?.status === "conflict") return {status: "conflict", activeJobId: common.activeJobId};
        if (common?.status === "reattached") {
            const existing = this.repository.get(common.job.id);
            return existing === undefined ? {status: "conflict", activeJobId: common.job.id} : {status: "created", job: toStudioSimulationJobView(existing)};
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
        this.cancelActiveRecord(record);
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
        this.cancelActiveRecord(record);
        return toStudioSimulationJobView(record);
    }

    // Best-effort: aborts every currently active job — called from StudioServer.stop() so a stopped
    // Studio process never leaves a simulation (or its worker threads) running against an event loop
    // nobody is serving HTTP requests on anymore.
    public cancelAll(): void {
        for (const record of this.repository.listActive()) {
            this.cancelActiveRecord(record);
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
                    this.jobService?.progress(record.id, {stage: "simulation", unit: "rounds", current: roundsCompleted, total: record.rounds});
                },
            });
            const result = await runner.run();

            // The runner is the authority on both the final number of rounds and why it stopped.
            // Capture its final duration before building the immutable report: the last progress
            // callback can precede runner cleanup, so using its older value made a completed
            // one-chunk run look instantaneous and dropped adaptive-stop metadata in Studio.
            const finalRoundsCompleted = result.statistics.rounds;
            const finalDurationMs = this.now() - record.startedAt;
            record.roundsCompleted = finalRoundsCompleted;
            record.durationMs = finalDurationMs;

            const report: SimulationReport = this.reportBuilder.build({
                manifest: result.manifest,
                requestedRounds: record.rounds,
                seed: record.seed,
                statistics: result.statistics,
                durationMs: record.durationMs,
                packageRoot: record.projectRoot,
                configHash: result.configHash,
                pokieVersion: this.pokieVersion,
                breakdown: result.breakdown,
                workers: result.workers,
                workerSeedStrategy: result.workerSeedStrategy,
                stopReason: result.stopReason,
                convergence: result.convergence,
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

    /** Runs canonical WASM in-process: portable components have no Node worker loader. */
    private async runWasmSimulation(record: StudioSimulationJobRecord): Promise<void> {
        if (record.abortController.signal.aborted) {
            this.cancelRecord(record);
            return;
        }
        this.markRunning(record);
        const seed = record.seed ?? crypto.randomUUID();
        let runtime;
        let disposeSession: (() => void) | undefined;
        try {
            runtime = await this.loadWasmRuntime(record.projectRoot, new SeededPokieWasmHost(seed));
            const session = runtime.createSession(seed, {credits: Number.MAX_SAFE_INTEGER});
            disposeSession = () => session.dispose();
            const accumulator = new SimulationAccumulator();
            let remaining = record.rounds;
            while (remaining > 0) {
                if (record.abortController.signal.aborted) {
                    this.cancelRecord(record);
                    return;
                }
                const chunk = Math.min(this.chunkSize, remaining);
                for (let index = 0; index < chunk; index++) {
                    if (record.abortController.signal.aborted) {
                        this.cancelRecord(record);
                        return;
                    }
                    const round = await session.play();
                    accumulator.addRound(round.stake, round.payout);
                }
                record.roundsCompleted += chunk;
                record.durationMs = this.now() - record.startedAt;
                this.jobService?.progress(record.id, {stage: "simulation", unit: "rounds", current: record.roundsCompleted, total: record.rounds});
                remaining -= chunk;
                if (remaining > 0) await this.yieldToEventLoop();
            }
            const statistics = accumulator.getStatistics();
            const report = this.reportBuilder.build({
                manifest: {id: runtime.manifest.component.id, name: runtime.manifest.component.id, version: runtime.manifest.component.version},
                requestedRounds: record.rounds,
                ...(record.seed === undefined ? {} : {seed: record.seed}),
                statistics,
                durationMs: record.durationMs,
                packageRoot: record.projectRoot,
                configHash: runtime.manifest.artifact?.configurationHash,
                workers: 1,
                pokieVersion: this.pokieVersion,
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
            this.onCompleted(record);
        } catch (error) {
            if (record.abortController.signal.aborted) this.cancelRecord(record);
            else this.fail(record, error);
        } finally {
            disposeSession?.();
            runtime?.dispose();
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
                    accumulator.addRound(selection.outcome.artifact.stake, selection.outcome.artifact.totalWin);
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
                this.jobService?.progress(record.id, {stage: "simulation", unit: "rounds", current: record.roundsCompleted, total: record.rounds});
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
            pokieVersion: this.pokieVersion,
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
        record.lastReplay = lastReplay;
        this.markTerminal(record);
        this.onCompleted(record);
    }

    private fail(record: StudioSimulationJobRecord, error: unknown): void {
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
        record.status = "cancelled";
        this.markTerminal(record);
    }

    // A queued canonical component has no runtime/session resource to release, so it can become
    // terminal immediately. Other project kinds may own temporary materialization stages while
    // queued; their run path continues to publish cancellation after it has cleaned those stages.
    private cancelActiveRecord(record: StudioSimulationJobRecord): void {
        if (record.status !== "queued" && record.status !== "running") return;
        record.abortController.abort();
        if (record.status === "queued" && isWasmComponentFile(record.projectRoot)) this.cancelRecord(record);
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
        if (record.status === "completed") {
            this.jobService?.complete(record.id, {summary: "Simulation completed.", detail: {rounds: record.roundsCompleted, reportAvailable: record.report !== undefined}});
        } else if (record.status === "cancelled") {
            this.jobService?.cancelled(record.id, {summary: "Simulation cancelled after the last completed round.", detail: {rounds: record.roundsCompleted}}, {action: "retry", reason: "Run the simulation again with the captured parameters."});
        } else if (record.status === "failed") {
            this.jobService?.fail(record.id, record.error ?? "Simulation failed.", {action: "retry", reason: "Correct the reported problem and run the simulation again."});
        }
    }

    private markRunning(record: StudioSimulationJobRecord): void {
        record.status = "running";
        this.jobService?.markRunning(record.id);
        this.jobService?.progress(record.id, {stage: "preparing", unit: "rounds", current: record.roundsCompleted, total: record.rounds});
    }
}
