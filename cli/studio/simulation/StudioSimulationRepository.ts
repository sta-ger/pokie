import type {StudioSimulationJobRecord} from "./StudioSimulationJobRecord.js";

export interface StudioSimulationRepository {
    save(record: StudioSimulationJobRecord): void;

    get(id: string): StudioSimulationJobRecord | undefined;

    // The concurrency-limiting lookup: at most one queued/running job per projectRoot at a time (see
    // StudioSimulationService.start()).
    findActiveByProjectRoot(projectRoot: string): StudioSimulationJobRecord | undefined;

    // Every currently queued/running job, regardless of project — used by
    // StudioSimulationService.cancelAll() (StudioServer.stop()) so no background simulation outlives
    // the server that started it.
    listActive(): StudioSimulationJobRecord[];
}
