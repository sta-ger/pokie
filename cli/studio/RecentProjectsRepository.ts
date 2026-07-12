import type {RecentProjectEntry} from "./RecentProjectEntry.js";

export interface RecentProjectsRepository {
    list(): Promise<RecentProjectEntry[]>;

    add(entry: RecentProjectEntry): Promise<void>;
}
