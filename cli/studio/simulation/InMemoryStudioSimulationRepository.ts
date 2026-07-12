import type {StudioSimulationJobRecord} from "./StudioSimulationJobRecord.js";
import type {StudioSimulationRepository} from "./StudioSimulationRepository.js";

const DEFAULT_MAX_TERMINAL_JOBS_PER_PROJECT = 20;

// The default StudioSimulationRepository — a process-lifetime Map, same scope/lifetime as
// InMemorySessionRepository/InMemoryRecentProjectsRepository. Records are stored (and returned) by
// reference: StudioSimulationService mutates a record's fields in place as a simulation progresses,
// and those mutations are visible through get()/findActiveByProjectRoot()/listActive() without
// needing a second save() call — deliberate, since this is a process-local, single-writer store, not
// a boundary that needs copy-on-read isolation. The one exception is a record's *first* terminal
// transition: StudioSimulationService calls save() again at that point specifically so retention (see
// below) gets a chance to run — see save()'s own doc comment.
//
// Retention: at most `maxTerminalJobsPerProject` terminal (completed/failed/cancelled) jobs are kept
// per projectRoot — a queued/running job is never evicted, regardless of how many terminal jobs pile
// up around it, since it isn't terminal yet. Enforced eagerly, inside save(), whenever the record
// being saved is itself terminal: the oldest terminal jobs for that same project (by completedAt) are
// deleted first, one at a time, until the project is back at/under the limit.
export class InMemoryStudioSimulationRepository implements StudioSimulationRepository {
    private readonly jobs = new Map<string, StudioSimulationJobRecord>();
    private readonly maxTerminalJobsPerProject: number;

    constructor(maxTerminalJobsPerProject: number = DEFAULT_MAX_TERMINAL_JOBS_PER_PROJECT) {
        this.maxTerminalJobsPerProject = maxTerminalJobsPerProject;
    }

    public save(record: StudioSimulationJobRecord): void {
        this.jobs.set(record.id, record);
        if (this.isTerminal(record)) {
            this.enforceRetention(record.projectRoot);
        }
    }

    public get(id: string): StudioSimulationJobRecord | undefined {
        return this.jobs.get(id);
    }

    public findActiveByProjectRoot(projectRoot: string): StudioSimulationJobRecord | undefined {
        for (const record of this.jobs.values()) {
            if (record.projectRoot === projectRoot && this.isActive(record)) {
                return record;
            }
        }
        return undefined;
    }

    public listActive(): StudioSimulationJobRecord[] {
        return [...this.jobs.values()].filter((record) => this.isActive(record));
    }

    public listTerminalByProjectRoot(projectRoot: string): StudioSimulationJobRecord[] {
        return [...this.jobs.values()]
            .filter((record) => record.projectRoot === projectRoot && this.isTerminal(record))
            .sort((a, b) => (b.completedAt ?? b.startedAt) - (a.completedAt ?? a.startedAt));
    }

    private enforceRetention(projectRoot: string): void {
        const oldestFirst = this.listTerminalByProjectRoot(projectRoot).reverse();
        const excess = oldestFirst.length - this.maxTerminalJobsPerProject;
        for (let i = 0; i < excess; i++) {
            this.jobs.delete(oldestFirst[i].id);
        }
    }

    private isActive(record: StudioSimulationJobRecord): boolean {
        return record.status === "queued" || record.status === "running";
    }

    private isTerminal(record: StudioSimulationJobRecord): boolean {
        return record.status === "completed" || record.status === "failed" || record.status === "cancelled";
    }
}
