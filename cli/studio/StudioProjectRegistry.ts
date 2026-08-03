import type {StudioProjectRegistryEntry} from "./StudioProjectRegistryEntry.js";

// The persistence contract every Studio project registry backend implements — mirrors
// RecentProjectsRepository's own "list/add" shape, but for the richer, cross-platform-persisted set of
// every managed and registered external project Studio knows about (not just the last few opened). See
// FileStudioProjectRegistry (the real, persisted implementation) and InMemoryStudioProjectRegistry (the
// process-lifetime one tests and any future ephemeral caller use).
export interface StudioProjectRegistry {
    list(): Promise<StudioProjectRegistryEntry[]>;

    // Most-recent-first, de-duplicated by `location` — re-registering/re-opening an existing entry
    // replaces it in place (moving it to the front) rather than creating a second one, the same
    // convention InMemoryRecentProjectsRepository.add already uses. Unlike that class, this has no fixed
    // cap: the registry is meant to hold every project Studio knows about, not just a short recent list.
    upsert(entry: StudioProjectRegistryEntry): Promise<void>;

    remove(location: string): Promise<void>;
}
