import type {RecentProjectEntry} from "./RecentProjectEntry.js";

export interface RecentProjectsRepository {
    list(): Promise<RecentProjectEntry[]>;

    // The guard belongs to the request that prepared this observable write. Implementations must
    // evaluate it immediately before changing their durable/in-memory state, after any asynchronous
    // preparation they need to do. Returning false means a newer request owns the Home transition.
    add(entry: RecentProjectEntry, options?: {readonly isCurrent?: () => boolean}): Promise<boolean>;
}
