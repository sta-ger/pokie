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
import {toStudioSimulationJobView} from "./toStudioSimulationJobView.js";
import type {ValidatedSimulationRequest} from "./validateSimulationRequest.js";

const DEFAULT_CHUNK_SIZE = 1000;

export type StudioSimulationStartResult =
    | {status: "created"; job: StudioSimulationJobView}
    | {status: "conflict"; activeJobId: string};

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
        record.durationMs = this.now() - record.startedAt;
    }

    private fail(record: StudioSimulationJobRecord, error: unknown): void {
        record.status = "failed";
        record.error = error instanceof Error ? error.message : String(error);
        record.durationMs = this.now() - record.startedAt;
    }

    private cancelRecord(record: StudioSimulationJobRecord): void {
        record.status = "cancelled";
        record.durationMs = this.now() - record.startedAt;
    }
}
