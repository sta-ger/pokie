import type {StudioReplayJobRecord} from "./StudioReplayJobRecord.js";

export interface StudioReplayRepository {
    // Also where retention is enforced: saving a record whose status is terminal (completed/failed/
    // cancelled) may evict the oldest terminal record(s) for that same projectRoot if doing so pushes
    // it over the per-project limit — see InMemoryStudioReplayRepository's own doc comment.
    // StudioReplayExecutionService calls this again (same id, same object) each time a record
    // transitions to a terminal status, specifically so this has a chance to run.
    save(record: StudioReplayJobRecord): void;

    get(id: string): StudioReplayJobRecord | undefined;

    // The concurrency-limiting lookup: at most one queued/running replay per projectRoot at a time
    // (see StudioReplayExecutionService.start()).
    findActiveByProjectRoot(projectRoot: string): StudioReplayJobRecord | undefined;

    // Every currently queued/running replay, regardless of project — used by
    // StudioReplayExecutionService.cancelAll() (StudioServer.stop()) so no background replay outlives
    // the server that started it.
    listActive(): StudioReplayJobRecord[];

    // Every replay for one project regardless of status (queued/running/completed/failed/cancelled),
    // most-recently-started first — the Replay tab's "Recent Replays" list, and also what retention
    // counts against (terminal records only — see the implementation's own doc comment). Never
    // includes another project's replays.
    listByProjectRoot(projectRoot: string): StudioReplayJobRecord[];
}
