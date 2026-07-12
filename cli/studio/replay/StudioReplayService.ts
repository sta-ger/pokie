import {loadPokieGame, PokieGame, ReplayDescriptor, ReplayRecorder, ReplayRecording} from "pokie";
import crypto from "crypto";
import {InMemoryStudioReplayRepository} from "./InMemoryStudioReplayRepository.js";
import type {StudioReplayListEntry} from "./StudioReplayListEntry.js";
import type {StudioReplayRecord} from "./StudioReplayRecord.js";
import type {StudioReplayRecordView} from "./StudioReplayRecordView.js";
import type {StudioReplayRepository} from "./StudioReplayRepository.js";
import {toStudioReplayListEntry, toStudioReplayRecordView} from "./toStudioReplayRecordView.js";
import type {ValidatedReplayRequest} from "./validateReplayRequest.js";

export type StudioReplayRunResult = {status: "ok"; record: StudioReplayRecordView} | {status: "error"; error: string};

// Drives ReplayRecorder/loadPokieGame — the exact same services `pokie replay` calls — directly. No
// CLI command is ever spawned as a subprocess, and none of ReplayRecorder's replay logic is
// reimplemented. Unlike StudioSimulationService, a replay has no queued/running phase at all: it's
// produced fully synchronously (see run()'s own doc comment for why that's safe here), so there's no
// job/progress/cancellation machinery to build — just record, store, and hand back the result.
export class StudioReplayService {
    private readonly repository: StudioReplayRepository;
    private readonly loadGame: typeof loadPokieGame;
    private readonly recorder: ReplayRecording;
    private readonly createId: () => string;

    constructor(
        repository: StudioReplayRepository = new InMemoryStudioReplayRepository(),
        loadGame: typeof loadPokieGame = loadPokieGame,
        recorder: ReplayRecording = new ReplayRecorder(),
        createId: () => string = () => crypto.randomUUID(),
    ) {
        this.repository = repository;
        this.loadGame = loadGame;
        this.recorder = recorder;
        this.createId = createId;
    }

    // ReplayRecorder.record() has no seek-to-round primitive (see its own doc comment): replaying
    // round N means playing a fresh session forward N times in one synchronous call. That's safe to
    // run directly inside an HTTP request handler as long as `request.round` is bounded (see
    // validateReplayRequest/MAX_STUDIO_REPLAY_ROUND) — unlike an open-ended simulation `rounds`
    // count, there's no reason to chunk/poll/cancel a single bounded replay.
    //
    // Never throws — a failure to load the game, or a failure during record() (e.g. the session
    // itself throwing), is caught and turned into a safe, plain-data error result instead of an
    // exception that could otherwise leak a stack trace to an HTTP response.
    public async run(projectRoot: string, request: ValidatedReplayRequest): Promise<StudioReplayRunResult> {
        let game: PokieGame;
        try {
            game = await this.loadGame(projectRoot);
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }

        let descriptor: ReplayDescriptor;
        try {
            descriptor = this.recorder.record({game, seed: request.seed, round: request.round});
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }

        const record: StudioReplayRecord = {id: this.createId(), projectRoot, descriptor};
        this.repository.save(record);
        return {status: "ok", record: toStudioReplayRecordView(record)};
    }

    // undefined covers both a genuinely unknown id AND an id that belongs to a different project —
    // deliberately indistinguishable from the caller's perspective, same reasoning as
    // StudioSimulationService.getReport(): this can never be used to probe whether some other
    // project has a replay with a given id.
    public getReplay(projectRoot: string, id: string): StudioReplayRecordView | undefined {
        const record = this.repository.get(id);
        if (!record || record.projectRoot !== projectRoot) {
            return undefined;
        }
        return toStudioReplayRecordView(record);
    }

    public listReplays(projectRoot: string): StudioReplayListEntry[] {
        return this.repository.listByProjectRoot(projectRoot).map((record) => toStudioReplayListEntry(record));
    }
}
