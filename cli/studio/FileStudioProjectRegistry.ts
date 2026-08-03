import {writeFileAtomically} from "pokie";
import fs from "fs";
import path from "path";
import type {StudioProjectRegistry} from "./StudioProjectRegistry.js";
import type {StudioProjectRegistryEntry} from "./StudioProjectRegistryEntry.js";

// The real, cross-platform-persisted StudioProjectRegistry -- what "Persist managed and registered Studio
// Projects" actually means: every entry survives a Studio restart, stored as one plain-JSON array file at
// `registryFile` (see PokiePathResolver.resolveAppDataDirectory for where that file lives on each
// platform -- never a hardcoded Linux-only path). There's exactly one Studio server process ever writing
// this file at a time (no concurrent-writer story to support), so "read the whole file, mutate in memory,
// write the whole file back" is simpler than a real append-only/journaled store and is the same tradeoff
// InMemoryRecentProjectsRepository already makes for its own, non-persistent list. Every write goes
// through writeFileAtomically (temp-file-and-rename, the same primitive `pokie reel --apply` uses) so a
// crash or failed write mid-save can never leave `registryFile` truncated or partially overwritten.
export class FileStudioProjectRegistry implements StudioProjectRegistry {
    private readonly registryFile: string;

    constructor(registryFile: string) {
        this.registryFile = registryFile;
    }

    public list(): Promise<StudioProjectRegistryEntry[]> {
        return this.read();
    }

    public async upsert(entry: StudioProjectRegistryEntry): Promise<void> {
        const entries = await this.read();
        await this.write([entry, ...entries.filter((existing) => existing.location !== entry.location)]);
    }

    public async remove(location: string): Promise<void> {
        const entries = await this.read();
        await this.write(entries.filter((existing) => existing.location !== location));
    }

    private async read(): Promise<StudioProjectRegistryEntry[]> {
        let raw: string;
        try {
            raw = await fs.promises.readFile(this.registryFile, "utf-8");
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
                return [];
            }
            throw error;
        }

        // A registry file that exists but isn't a valid JSON array (corrupted by an out-of-band edit, a
        // failed write from a POKIE version this class didn't ship in, ...) is treated as empty rather
        // than thrown -- the same "never let a corrupt cache file crash Studio's startup" choice every
        // other best-effort read in this codebase makes (e.g. PlatformDirectories' own XDG user-dirs.dirs
        // read). The next successful upsert/remove overwrites it with a well-formed file again.
        try {
            const parsed: unknown = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as StudioProjectRegistryEntry[]) : [];
        } catch {
            return [];
        }
    }

    private async write(entries: StudioProjectRegistryEntry[]): Promise<void> {
        await fs.promises.mkdir(path.dirname(this.registryFile), {recursive: true});
        await writeFileAtomically(this.registryFile, (tempPath) => fs.promises.writeFile(tempPath, `${JSON.stringify(entries, null, 4)}\n`, "utf-8"));
    }
}
