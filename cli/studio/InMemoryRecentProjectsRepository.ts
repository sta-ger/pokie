import type {RecentProjectEntry} from "./RecentProjectEntry.js";
import type {RecentProjectsRepository} from "./RecentProjectsRepository.js";

const MAX_ENTRIES = 10;

// The default RecentProjectsRepository — a process-lifetime list, same lifetime/scope as
// InMemorySessionRepository. A later FileRecentProjectsRepository (persisting across restarts)
// would implement the exact same interface, swapped in wherever StudioServer is constructed.
export class InMemoryRecentProjectsRepository implements RecentProjectsRepository {
    private entries: RecentProjectEntry[] = [];

    public list(): Promise<RecentProjectEntry[]> {
        return Promise.resolve([...this.entries]);
    }

    // Most-recent-first, de-duplicated by projectRoot (re-opening an existing entry moves it to the
    // front rather than creating a second one), capped at MAX_ENTRIES.
    public add(entry: RecentProjectEntry): Promise<void> {
        this.entries = [entry, ...this.entries.filter((existing) => existing.projectRoot !== entry.projectRoot)].slice(
            0,
            MAX_ENTRIES,
        );
        return Promise.resolve();
    }
}
