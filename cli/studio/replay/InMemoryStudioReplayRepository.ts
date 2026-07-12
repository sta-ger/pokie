import type {StudioReplayRecord} from "./StudioReplayRecord.js";
import type {StudioReplayRepository} from "./StudioReplayRepository.js";

const DEFAULT_MAX_REPLAYS_PER_PROJECT = 20;

// The default StudioReplayRepository — a process-lifetime Map, same scope/lifetime as
// InMemoryStudioSimulationRepository. Unlike simulations, a replay has no queued/running phase (see
// StudioReplayService.run() — it's produced synchronously, in full, before ever being saved), so
// there's no "active" record to protect from eviction here: retention only ever has to pick the
// oldest record(s) for a project once it's over the limit.
export class InMemoryStudioReplayRepository implements StudioReplayRepository {
    private readonly records = new Map<string, StudioReplayRecord>();
    private readonly maxReplaysPerProject: number;

    constructor(maxReplaysPerProject: number = DEFAULT_MAX_REPLAYS_PER_PROJECT) {
        this.maxReplaysPerProject = maxReplaysPerProject;
    }

    public save(record: StudioReplayRecord): void {
        this.records.set(record.id, record);
        this.enforceRetention(record.projectRoot);
    }

    public get(id: string): StudioReplayRecord | undefined {
        return this.records.get(id);
    }

    public listByProjectRoot(projectRoot: string): StudioReplayRecord[] {
        return [...this.records.values()]
            .filter((record) => record.projectRoot === projectRoot)
            .sort((a, b) => b.descriptor.timestamp - a.descriptor.timestamp);
    }

    private enforceRetention(projectRoot: string): void {
        const oldestFirst = this.listByProjectRoot(projectRoot).reverse();
        const excess = oldestFirst.length - this.maxReplaysPerProject;
        for (let i = 0; i < excess; i++) {
            this.records.delete(oldestFirst[i].id);
        }
    }
}
