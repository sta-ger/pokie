import type {StudioSimulationJobRecord} from "./StudioSimulationJobRecord.js";
import type {StudioSimulationRepository} from "./StudioSimulationRepository.js";

// The default StudioSimulationRepository — a process-lifetime Map, same scope/lifetime as
// InMemorySessionRepository/InMemoryRecentProjectsRepository. Records are stored (and returned) by
// reference: StudioSimulationService mutates a record's fields in place as a simulation progresses,
// and those mutations are visible through get()/findActiveByProjectRoot()/listActive() without
// needing a second save() call — deliberate, since this is a process-local, single-writer store, not
// a boundary that needs copy-on-read isolation.
export class InMemoryStudioSimulationRepository implements StudioSimulationRepository {
    private readonly jobs = new Map<string, StudioSimulationJobRecord>();

    public save(record: StudioSimulationJobRecord): void {
        this.jobs.set(record.id, record);
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

    private isActive(record: StudioSimulationJobRecord): boolean {
        return record.status === "queued" || record.status === "running";
    }
}
