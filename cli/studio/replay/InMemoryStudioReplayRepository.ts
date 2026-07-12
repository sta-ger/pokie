import type {StudioReplayJobRecord} from "./StudioReplayJobRecord.js";
import type {StudioReplayRepository} from "./StudioReplayRepository.js";

const DEFAULT_MAX_TERMINAL_REPLAYS_PER_PROJECT = 20;

// The default StudioReplayRepository — a process-lifetime Map, same scope/lifetime/by-reference
// mutation model as InMemoryStudioSimulationRepository (see that class's own doc comment for the full
// reasoning). The one exception is a record's *first* terminal transition: StudioReplayExecutionService
// calls save() again at that point specifically so retention (see below) gets a chance to run.
//
// Retention: at most `maxTerminalReplaysPerProject` terminal (completed/failed/cancelled) replays are
// kept per projectRoot — a queued/running replay is never evicted, regardless of how many terminal
// replays pile up around it, since it isn't terminal yet. Enforced eagerly, inside save(), whenever
// the record being saved is itself terminal: the oldest terminal replays for that same project (by
// completedAt) are deleted first, one at a time, until the project is back at/under the limit.
export class InMemoryStudioReplayRepository implements StudioReplayRepository {
    private readonly jobs = new Map<string, StudioReplayJobRecord>();
    private readonly maxTerminalReplaysPerProject: number;

    constructor(maxTerminalReplaysPerProject: number = DEFAULT_MAX_TERMINAL_REPLAYS_PER_PROJECT) {
        this.maxTerminalReplaysPerProject = maxTerminalReplaysPerProject;
    }

    public save(record: StudioReplayJobRecord): void {
        this.jobs.set(record.id, record);
        if (this.isTerminal(record)) {
            this.enforceRetention(record.projectRoot);
        }
    }

    public get(id: string): StudioReplayJobRecord | undefined {
        return this.jobs.get(id);
    }

    public findActiveByProjectRoot(projectRoot: string): StudioReplayJobRecord | undefined {
        for (const record of this.jobs.values()) {
            if (record.projectRoot === projectRoot && this.isActive(record)) {
                return record;
            }
        }
        return undefined;
    }

    public listActive(): StudioReplayJobRecord[] {
        return [...this.jobs.values()].filter((record) => this.isActive(record));
    }

    public listByProjectRoot(projectRoot: string): StudioReplayJobRecord[] {
        return [...this.jobs.values()]
            .filter((record) => record.projectRoot === projectRoot)
            .sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt));
    }

    private enforceRetention(projectRoot: string): void {
        const oldestTerminalFirst = [...this.jobs.values()]
            .filter((record) => record.projectRoot === projectRoot && this.isTerminal(record))
            .sort((a, b) => (a.completedAt ?? a.startedAt) - (b.completedAt ?? b.startedAt));
        const excess = oldestTerminalFirst.length - this.maxTerminalReplaysPerProject;
        for (let i = 0; i < excess; i++) {
            this.jobs.delete(oldestTerminalFirst[i].id);
        }
    }

    private isActive(record: StudioReplayJobRecord): boolean {
        return record.status === "queued" || record.status === "running";
    }

    private isTerminal(record: StudioReplayJobRecord): boolean {
        return record.status === "completed" || record.status === "failed" || record.status === "cancelled";
    }
}
