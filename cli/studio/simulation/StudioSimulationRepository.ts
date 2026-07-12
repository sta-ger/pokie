import type {StudioSimulationJobRecord} from "./StudioSimulationJobRecord.js";

export interface StudioSimulationRepository {
    // Also where retention is enforced: saving a record whose status is terminal (completed/failed/
    // cancelled) may evict the oldest terminal record(s) for that same projectRoot if doing so pushes
    // it over the per-project limit — see InMemoryStudioSimulationRepository's own doc comment.
    // StudioSimulationService calls this again (same id, same object) each time a record transitions
    // to a terminal status, specifically so this has a chance to run.
    save(record: StudioSimulationJobRecord): void;

    get(id: string): StudioSimulationJobRecord | undefined;

    // The concurrency-limiting lookup: at most one queued/running job per projectRoot at a time (see
    // StudioSimulationService.start()).
    findActiveByProjectRoot(projectRoot: string): StudioSimulationJobRecord | undefined;

    // Every currently queued/running job, regardless of project — used by
    // StudioSimulationService.cancelAll() (StudioServer.stop()) so no background simulation outlives
    // the server that started it.
    listActive(): StudioSimulationJobRecord[];

    // Every completed/failed/cancelled job for one project, most-recently-completed first — the
    // Reports tab's underlying data source (further filtered to "completed" only by
    // StudioSimulationService.listReports()) and also what retention counts against. Never includes
    // another project's jobs, and never includes a queued/running one.
    listTerminalByProjectRoot(projectRoot: string): StudioSimulationJobRecord[];
}
