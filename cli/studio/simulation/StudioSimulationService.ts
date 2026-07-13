import {
    AggregateSimulationRunner,
    loadPokieGame,
    PokieGame,
    SimulationAccumulator,
    SimulationBreakdownComponent,
    SimulationReport,
    SimulationReportBuilder,
    SimulationReportBuilding,
} from "pokie";
import crypto from "crypto";
import {InMemoryStudioSimulationRepository} from "./InMemoryStudioSimulationRepository.js";
import {mergeBreakdownComponents} from "./mergeBreakdownComponents.js";
import type {StudioSimulationJobRecord} from "./StudioSimulationJobRecord.js";
import type {StudioSimulationJobView} from "./StudioSimulationJobView.js";
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
    | {status: "ok"; report: SimulationReport}
    | {status: "not-found"}
    // Either not terminal yet (queued/running) or terminal without a report (failed/cancelled) —
    // `jobStatus` tells the caller which, so it can phrase a precise message either way.
    | {status: "not-ready"; jobStatus: StudioSimulationStatus};

// Drives AggregateSimulationRunner/SimulationAccumulator/SimulationReportBuilder — the exact same
// simulation services `pokie sim` calls — directly, in chunks, so a long simulation never blocks the
// HTTP server's event loop (see run()'s own doc comment for why chunking is unavoidable here: none
// of those services have a native async/resumable/abortable API of their own). No CLI command is
// ever spawned as a subprocess, and none of their logic is reimplemented — only the chunk-merging
// glue (mergeBreakdownComponents) is new, since a resumable run wasn't something any of them
// supported natively.
export class StudioSimulationService {
    private readonly repository: StudioSimulationRepository;
    private readonly loadGame: typeof loadPokieGame;
    private readonly reportBuilder: SimulationReportBuilding;
    private readonly chunkSize: number;
    private readonly now: () => number;
    private readonly yieldToEventLoop: () => Promise<void>;
    private readonly createId: () => string;

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
    ) {
        this.repository = repository;
        this.loadGame = loadGame;
        this.reportBuilder = reportBuilder;
        this.chunkSize = chunkSize;
        this.now = now;
        this.yieldToEventLoop = yieldToEventLoop;
        this.createId = createId;
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
            startedAt: this.now(),
            roundsCompleted: 0,
            durationMs: 0,
            abortController: new AbortController(),
        };
        this.repository.save(record);

        this.run(record).catch(() => {
            // run() already catches every failure into the record's own "failed" status (see
            // below) — this is an extra safety net only, so a bug there can never surface as an
            // unhandled promise rejection and crash the process.
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
    // Studio process never leaves a simulation's chunk loop scheduled against an event loop nobody is
    // serving HTTP requests on anymore.
    public cancelAll(): void {
        for (const record of this.repository.listActive()) {
            record.abortController.abort();
        }
    }

    // Same reasoning as cancelAll(), scoped to one project — called from StudioServer whenever Studio
    // switches away from `projectRoot` (a different project opened, or back to Home), so a simulation
    // for the project just left doesn't keep running its chunk loop unseen and unreachable (its own
    // job/report becomes unreachable through this project's own routes the moment the switch happens
    // anyway — see getReport()/listReports()'s own projectRoot scoping — so leaving it running would
    // only waste CPU, never remain usable). A no-op when nothing is active for that project.
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
        return {status: "ok", report: record.report};
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
            rtp: report.rtp,
            hitFrequency: report.hitFrequency,
            maxWin: report.maxWin,
            startedAt: new Date(record.startedAt).toISOString(),
            completedAt: new Date(record.completedAt ?? record.startedAt).toISOString(),
            durationMs: record.durationMs,
            hasWarnings: (report.warnings?.length ?? 0) > 0,
        };
    }

    // Chunked rather than a single `new AggregateSimulationRunner(session, rounds).run()` call: that
    // runner is a tight synchronous loop with no yield points and no abort/progress hooks of its own,
    // so calling it once for the full round count would block this process's entire event loop for
    // the whole simulation — no other request (a status poll, a cancel, even an unrelated Inspect
    // call) could be served until it finished. Driving it in bounded chunks against the same session,
    // merging each chunk's SimulationAccumulator (already-merge-capable) and breakdown into a running
    // total, and yielding once per chunk is what makes progress polling and real mid-run cancellation
    // possible at all.
    private async run(record: StudioSimulationJobRecord): Promise<void> {
        let game: PokieGame;
        try {
            game = await this.loadGame(record.projectRoot);
        } catch (error) {
            this.fail(record, error);
            return;
        }

        if (record.abortController.signal.aborted) {
            this.cancelRecord(record);
            return;
        }

        record.status = "running";

        let session;
        try {
            session = game.createSession(record.seed === undefined ? undefined : {seed: record.seed});
            // Simulations measure RTP/volatility, not risk of ruin — same as `pokie sim` itself.
            session.setCreditsAmount(Number.MAX_SAFE_INTEGER);
        } catch (error) {
            this.fail(record, error);
            return;
        }

        const accumulator = new SimulationAccumulator();
        let breakdown: Record<string, SimulationBreakdownComponent> | undefined;
        let roundsRemaining = record.rounds;

        try {
            while (roundsRemaining > 0) {
                if (record.abortController.signal.aborted) {
                    this.cancelRecord(record);
                    return;
                }

                const chunkRounds = Math.min(this.chunkSize, roundsRemaining);
                const runner = new AggregateSimulationRunner(session, chunkRounds);
                const chunkAccumulator = runner.run();
                accumulator.merge(chunkAccumulator);
                const chunkBreakdown = runner.getBreakdownStatistics();
                if (chunkBreakdown) {
                    breakdown = mergeBreakdownComponents(breakdown, chunkBreakdown);
                }

                const chunkRoundsPlayed = chunkAccumulator.getStatistics().rounds;
                record.roundsCompleted += chunkRoundsPlayed;
                record.durationMs = this.now() - record.startedAt;

                // The session stopped playing on its own (canPlayNextGame() returning false) before
                // using every round in this chunk — same "actual rounds can be less than requested"
                // behavior `pokie sim` already has. No point scheduling further chunks once that's
                // happened.
                if (chunkRoundsPlayed < chunkRounds) {
                    break;
                }

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
            manifest: game.getManifest(),
            requestedRounds: record.rounds,
            seed: record.seed,
            statistics,
            durationMs: record.durationMs,
            packageRoot: record.projectRoot,
            breakdown,
        });

        record.status = "completed";
        record.report = report;
        record.statistics = {
            volatility: statistics.volatility,
            payoutStandardDeviation: statistics.payoutStandardDeviation,
            returnStandardDeviation: statistics.returnStandardDeviation,
            averagePayoutConfidenceInterval95: statistics.averagePayoutConfidenceInterval95,
            rtpConfidenceInterval95: statistics.rtpConfidenceInterval95,
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
