import type {StudioProjectRegistry} from "./StudioProjectRegistry.js";
import type {StudioProjectRegistryEntry} from "./StudioProjectRegistryEntry.js";

// The default, process-lifetime StudioProjectRegistry — same lifetime/scope tradeoff
// InMemoryRecentProjectsRepository already makes, and the one every test that doesn't care about real
// filesystem persistence should use instead of FileStudioProjectRegistry.
export class InMemoryStudioProjectRegistry implements StudioProjectRegistry {
    private entries: StudioProjectRegistryEntry[] = [];

    public list(): Promise<StudioProjectRegistryEntry[]> {
        return Promise.resolve([...this.entries]);
    }

    public upsert(entry: StudioProjectRegistryEntry): Promise<void> {
        this.entries = [entry, ...this.entries.filter((existing) => existing.location !== entry.location)];
        return Promise.resolve();
    }

    public replace(entry: StudioProjectRegistryEntry, replacedLocations: readonly string[], options: {readonly isCurrent?: () => boolean} = {}): Promise<boolean> {
        if (options.isCurrent?.() === false) {
            return Promise.resolve(false);
        }
        const replaced = new Set(replacedLocations);
        this.entries = [entry, ...this.entries.filter((existing) => !replaced.has(existing.location))];
        return Promise.resolve(true);
    }

    public remove(location: string): Promise<void> {
        this.entries = this.entries.filter((existing) => existing.location !== location);
        return Promise.resolve();
    }
}
