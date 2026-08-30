import {describeUnavailableWasmComponent, ProjectTargetResolver, type PokieProject, type ProjectResolving, type ProjectType, wasmProductContractView} from "pokie";
import fs from "fs";
import path from "path";
import {PokiePathResolver} from "../paths/PokiePathResolver.js";
import {FileStudioProjectRegistry} from "./FileStudioProjectRegistry.js";
import type {StudioHomeRecentProjectView} from "./home/StudioHomeRecentProjectView.js";
import {InMemoryStudioProjectRegistry} from "./InMemoryStudioProjectRegistry.js";
import type {StudioProjectRegistrationResult} from "./StudioProjectRegistrationResult.js";
import type {StudioProjectRegistry} from "./StudioProjectRegistry.js";
import type {StudioProjectOrigin, StudioProjectRegistryEntry} from "./StudioProjectRegistryEntry.js";
import type {StudioProjectRegistryView} from "./StudioProjectRegistryView.js";
import type {StudioProjectImportPreviewResult} from "./StudioProjectImportPreviewResult.js";

// The file name FileStudioProjectRegistry's persisted registry lives under, inside whatever app-data
// directory PokiePathResolver.resolveAppDataDirectory() resolves -- shared between
// createDefaultStudioProjectRegistrationService below and any test that needs to point at the exact same
// production location (see tests/cli/studio/FileStudioProjectRegistry.test.ts), so the two can never
// silently drift apart.
export const PROJECT_REGISTRY_FILE_NAME = "projects.json";

// The registry backend a real Studio runtime (StudioServer) composes StudioProjectRegistrationService
// with: a FileStudioProjectRegistry rooted at the platform app-data directory when one can be resolved,
// so registrations survive a Studio restart (see FileStudioProjectRegistry's own doc comment) -- falling
// back to the same process-lifetime InMemoryStudioProjectRegistry every other caller/test already gets
// by default when no app-data directory can be determined at all (e.g. no resolvable home directory on
// this machine). Studio's own startup must never fail, or even degrade any other feature, just because
// it can't persist this one registry -- see PokiePathResolver.resolveAppDataDirectory's own doc comment
// for why that case returns `undefined` rather than throwing.
export function createDefaultStudioProjectRegistrationService(
    pathResolver: PokiePathResolver = new PokiePathResolver(),
): StudioProjectRegistrationService {
    const appDataDirectory = pathResolver.resolveAppDataDirectory();
    if (appDataDirectory === undefined) {
        return new StudioProjectRegistrationService();
    }
    return new StudioProjectRegistrationService(new FileStudioProjectRegistry(path.join(appDataDirectory, PROJECT_REGISTRY_FILE_NAME)));
}

// Which ProjectType each resolves from a *file* on disk (blueprint/parWorkbook/wasm) vs. a *directory*
// (tsPackage/outcomeLibrary/stakeAdapter) — mirrors each ProjectTargetTypeAdapter's own `targetKind` (see
// ProjectTargetResolver's default adapter list in the pokie package), duplicated here as a small closed
// lookup rather than importing the adapters themselves, since this only ever needs the file/directory
// fact, not resolution itself.
const FILE_PROJECT_TYPES: ReadonlySet<ProjectType> = new Set(["blueprint", "parWorkbook", "wasm"]);

// Owns the registration lifecycle for both halves of "Persist managed and registered Studio Projects":
//   - registerManaged: a project POKIE itself just created/built (Create/Init/Build from Home), living
//     under the platform "POKIE Projects" convention — see PokiePathResolver.resolveIndependentProjectDirectory.
//   - registerExternal: an already-existing package/library/WASM target the user has elsewhere —
//     registered by its own path, never copied into POKIE's own managed location.
// Both funnel through the same `resolveProject` (a real ProjectTargetResolver by default) so an entry's
// `type`/`capabilities` are always what's actually on disk right now, not whatever a caller happened to
// assert — the same "resolve, don't trust the caller" discipline every migrated CLI command already
// applies via this exact resolver (see docs/pokie-phase3-inventory.md §1's P3-POLISH-09 update).
export class StudioProjectRegistrationService {
    private readonly registry: StudioProjectRegistry;
    private readonly resolveProject: ProjectResolving;
    private readonly pathExists: (candidate: string) => boolean;

    constructor(
        registry: StudioProjectRegistry = new InMemoryStudioProjectRegistry(),
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        pathExists: (candidate: string) => boolean = (candidate) => fs.existsSync(candidate),
    ) {
        this.registry = registry;
        this.resolveProject = resolveProject;
        this.pathExists = pathExists;
    }

    // Every registered project, most-recently-registered/opened first, each stamped with a freshly-
    // computed `status` — "missing" once its own `location` can no longer be found on disk, "ok"
    // otherwise. Never silently drops a missing entry, same reasoning as
    // StudioHomeService.listRecentProjects' own `missing` flag: a project a user moved or deleted outside
    // Studio still shows up, so they can re-locate or remove it explicitly instead of it vanishing
    // without explanation.
    public async list(): Promise<StudioProjectRegistryView[]> {
        const entries = await this.registry.list();
        const canonicalEntries = await Promise.all(entries.map(async (entry) => ({entry, location: await this.canonicalize(entry.location)})));
        const seenLocations = new Set<string>();
        const refreshed = await Promise.all(canonicalEntries.map(async ({entry, location}) => {
            if (entry.type !== "wasm") return {...entry, location, status: this.pathExists(location) ? "ok" as const : "missing" as const};
            if (!this.pathExists(location)) return {...entry, location, status: "missing" as const, wasmPresentation: wasmProductContractView()};
            try {
                const resolved = await this.resolveRecognizedProject(location);
                if (resolved === undefined) {
                    return {
                        ...entry,
                        location,
                        status: "unavailable" as const,
                        unavailableReason: describeUnavailableWasmComponent(),
                        wasmPresentation: wasmProductContractView(),
                    };
                }
                return {
                    ...entry,
                    location: resolved.location,
                    type: resolved.project.type,
                    capabilities: resolved.project.capabilities,
                    status: "ok" as const,
                    wasmPresentation: wasmProductContractView(),
                };
            } catch (error) {
                return {
                    ...entry,
                    location,
                    status: "unavailable" as const,
                    unavailableReason: error instanceof Error ? error.message : String(error),
                    wasmPresentation: wasmProductContractView(),
                };
            }
        }));
        return refreshed.flatMap((entry) => {
            // Older registry files can contain aliases written before canonical identity was introduced.
            // Keep the most-recent row only; callers never see two records for one physical Project.
            if (seenLocations.has(entry.location)) {
                return [];
            }
            seenLocations.add(entry.location);
            return [entry];
        });
    }

    // `importedFromParSheetPath`, when given, records that `location`'s own managed Blueprint was Applied
    // and first-saved from that .xlsx workbook (see StudioBlueprintService.saveManaged's own doc comment)
    // -- forwarded straight onto the registered entry (see StudioProjectRegistryEntry's own doc comment
    // for why this, not the blueprint file itself, is where that provenance lives).
    public registerManaged(location: string, name: string, importedFromParSheetPath?: string, conversionEvidencePath?: string): Promise<StudioProjectRegistrationResult> {
        return this.register(location, "managed", name, importedFromParSheetPath, conversionEvidencePath);
    }

    // Registers an already-existing package/library/WASM target by its own path — resolves it (never
    // copies a single file from it), and records it with origin "external". `name` defaults to the
    // resolved path's own basename (its file extension stripped for a file-kind project) when not given,
    // since an external target has no scaffolded manifest name the way a freshly-created managed project
    // does.
    public registerExternal(location: string, name?: string): Promise<StudioProjectRegistrationResult> {
        return this.register(location, "external", name);
    }

    // Records the successful Open as Project transition in the same durable registry as Import and
    // managed creation.  This is deliberately separate from registerExternal(): opening an already
    // managed project must refresh its recency without quietly changing its origin to "external".
    public async recordOpened(
        location: string,
        name?: string,
        options: {readonly isCurrent?: () => boolean; readonly signal?: AbortSignal} = {},
    ): Promise<StudioProjectRegistrationResult> {
        const resolved = await this.resolveRecognizedProject(location);
        this.assertRecordOpenedCurrent(options);
        if (resolved === undefined) {
            return {status: "unrecognized", path: await this.canonicalize(location)};
        }

        const matchingEntries = await this.entriesAt(resolved.location);
        this.assertRecordOpenedCurrent(options);
        const existing = matchingEntries[0];
        const entry: StudioProjectRegistryEntry = {
            location: resolved.location,
            name: name?.trim() || existing?.name || defaultProjectName(resolved.location, resolved.project.type),
            type: resolved.project.type,
            capabilities: resolved.project.capabilities,
            origin: existing?.origin ?? "external",
            lastOpenedAt: new Date().toISOString(),
            importedFromParSheetPath: existing?.importedFromParSheetPath,
            conversionEvidencePath: existing?.conversionEvidencePath,
        };
        const committed = await this.replace(entry, matchingEntries, {isCurrent: () => !options.signal?.aborted && options.isCurrent?.() !== false});
        if (!committed) {
            this.assertRecordOpenedCurrent({...options, isCurrent: () => false});
        }
        this.assertRecordOpenedCurrent(options);
        return {status: "ok", entry: {...entry, status: "ok"}};
    }

    public async remove(location: string): Promise<void> {
        const canonicalLocation = await this.canonicalize(location);
        const entries = await this.entriesAt(canonicalLocation);
        await Promise.all(entries.map((entry) => this.registry.remove(entry.location)));
    }

    // Replaces a missing registry location with a recognized Project at its new location.  Nothing is
    // copied or deleted: this is solely the explicit "I moved it here" repair operation.  Keeping the
    // old entry's origin, display name and PAR provenance makes relocation a registry repair rather than
    // an accidental re-import with different semantics.
    public async relocate(oldLocation: string, newLocation: string): Promise<StudioProjectRegistrationResult> {
        const oldCanonicalLocation = await this.canonicalize(oldLocation);
        const oldEntries = await this.entriesAt(oldCanonicalLocation);
        const previous = oldEntries[0];
        if (previous === undefined) {
            return {status: "unrecognized", path: oldCanonicalLocation};
        }

        const resolved = await this.resolveRecognizedProject(newLocation);
        if (resolved === undefined) {
            return {status: "unrecognized", path: await this.canonicalize(newLocation)};
        }
        const destinationEntries = await this.entriesAt(resolved.location);
        const entry: StudioProjectRegistryEntry = {
            ...previous,
            location: resolved.location,
            type: resolved.project.type,
            capabilities: resolved.project.capabilities,
            lastOpenedAt: new Date().toISOString(),
        };
        await this.replace(entry, [...oldEntries, ...destinationEntries]);
        return {status: "ok", entry: {...entry, status: "ok"}};
    }

    // The Import Project flow's own "detect" step — resolves `location` exactly like registerExternal
    // does, but never upserts the registry, so a caller can show what a path resolves to (type,
    // capabilities, suggested name) and let the user confirm before it's actually registered. A
    // "parWorkbook" preview is recognized here the same as any other type -- routing a PAR sheet to the
    // Blueprint Editor's own import flow instead of registering it is a decision the caller (Studio's
    // Projects UI) makes from this result, not something this service special-cases.
    public async previewImport(location: string): Promise<StudioProjectImportPreviewResult> {
        const resolved = await this.resolveRecognizedProject(location);
        if (resolved === undefined) {
            return {status: "unrecognized", path: await this.canonicalize(location)};
        }
        return {
            status: "recognized",
            location: resolved.location,
            type: resolved.project.type,
            capabilities: resolved.project.capabilities,
            suggestedName: defaultProjectName(resolved.location, resolved.project.type),
        };
    }

    // A one-time, best-effort sync of Home's own recent-projects list (see
    // StudioHomeService.listRecentProjects/RecentProjectsRepository) into this registry -- run once by
    // StudioServer on startup, not a caller-triggered action of its own. RecentProjectsRepository has
    // never itself been persisted (see its own doc comment: "in-memory (no persistent path)"), so without
    // this a project a user already has open or recently touched would only ever show up in the
    // persistent registry once they re-create/re-open/re-register it explicitly by hand. Each entry is
    // registered the same "resolve, don't trust the caller" way as any other external registration (see
    // registerExternal) -- an entry whose path no longer resolves to a known POKIE project type comes
    // back "unrecognized" rather than throwing, a `missing` entry (see StudioHomeRecentProjectView) is
    // skipped outright before ever reaching the resolver, and a resolver error for one entry (e.g. an
    // ambiguous or unsupported target -- see ProjectTargetResolver's own doc comment) is swallowed rather
    // than aborting the rest of the list. Idempotent by construction: registerExternal ultimately upserts
    // by `location` (see StudioProjectRegistry.upsert), so calling this more than once (Studio restarted,
    // or start() somehow invoked twice) never creates a duplicate entry -- it only refreshes lastOpenedAt.
    public async migrateRecentProjects(recentProjects: readonly StudioHomeRecentProjectView[]): Promise<void> {
        for (const recent of recentProjects) {
            if (recent.missing) {
                continue;
            }
            try {
                await this.registerExternal(recent.projectRoot, recent.name);
            } catch {
                // Best-effort only -- see this method's own doc comment.
            }
        }
    }

    // Best-effort project identity for the Project Dashboard's own Overview -- resolves `location`
    // exactly like previewImport does (type/capabilities always fresh off disk, never a stale registry
    // copy), then separately looks up a registry entry at that same resolved location purely for its
    // `origin` (a project opened ad hoc, e.g. `pokie <path>`, may never have been registered at all, so
    // `origin` alone is allowed to come back undefined while type/capabilities still do not). Never
    // throws: an unresolvable location, or one ProjectTargetResolver can't disambiguate
    // (ProjectTargetAmbiguousError) or rejects outright (ProjectTargetUnsupportedError), simply means
    // there is no identity to report here -- the Overview these feed just omits them, exactly as it
    // already does for a "loading"/"error" dashboard.
    public async describeLocation(
        location: string,
    ): Promise<{type: ProjectType; capabilities: readonly string[]; origin?: StudioProjectOrigin} | undefined> {
        let resolved;
        try {
            resolved = await this.resolveRecognizedProject(location);
        } catch {
            return undefined;
        }
        if (!resolved) {
            return undefined;
        }
        const registered = (await this.entriesAt(resolved.location))[0];
        return {type: resolved.project.type, capabilities: resolved.project.capabilities, origin: registered?.origin};
    }

    // The directory a "show in folder" action should reveal for a given entry — the entry's own
    // `location` when it's already a directory (tsPackage/outcomeLibrary/stakeAdapter), or its containing
    // directory when `location` is itself a file (blueprint/parWorkbook/wasm). A pure function of an
    // already-resolved entry so a caller (a future Studio route) can feed the result straight into the
    // existing POST /api/home/fs/open-folder handler (StudioServer.handleHomeFsOpenFolder) without this
    // service needing to know anything about HTTP or spawn an OS command itself.
    public resolveShowInFolderTarget(entry: Pick<StudioProjectRegistryEntry, "location" | "type">): string {
        return FILE_PROJECT_TYPES.has(entry.type) ? path.dirname(entry.location) : entry.location;
    }

    private async register(
        location: string,
        origin: StudioProjectOrigin,
        name?: string,
        importedFromParSheetPath?: string,
        conversionEvidencePath?: string,
    ): Promise<StudioProjectRegistrationResult> {
        const resolved = await this.resolveRecognizedProject(location);
        if (resolved === undefined) {
            return {status: "unrecognized", path: await this.canonicalize(location)};
        }

        const trimmedName = name?.trim();
        const entry: StudioProjectRegistryEntry = {
            location: resolved.location,
            name: trimmedName && trimmedName.length > 0 ? trimmedName : defaultProjectName(resolved.location, resolved.project.type),
            type: resolved.project.type,
            capabilities: resolved.project.capabilities,
            origin,
            lastOpenedAt: new Date().toISOString(),
            importedFromParSheetPath,
            conversionEvidencePath,
        };
        await this.replace(entry, await this.entriesAt(resolved.location));
        return {status: "ok", entry: {...entry, status: "ok"}};
    }

    // ProjectTargetResolver intentionally preserves the spelling it was given.  The registry cannot:
    // relative paths, absolute paths and symlink aliases must be one identity across a restart.  A
    // dangling/missing path has no real path to resolve, so its absolute spelling remains the stable key
    // until a user explicitly relocates or removes it.
    private async canonicalize(location: string): Promise<string> {
        const absoluteLocation = path.resolve(location);
        try {
            return path.resolve(await fs.promises.realpath(absoluteLocation));
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code;
            if (code === "ENOENT" || code === "ENOTDIR") {
                return absoluteLocation;
            }
            throw error;
        }
    }

    private async resolveRecognizedProject(location: string): Promise<{location: string; project: PokieProject} | undefined> {
        const canonicalLocation = await this.canonicalize(location);
        const project = await this.resolveProject.resolve(canonicalLocation);
        if (project === undefined) {
            return undefined;
        }
        return {location: await this.canonicalize(project.rootPath), project};
    }

    private async entriesAt(canonicalLocation: string): Promise<StudioProjectRegistryEntry[]> {
        const entries = await this.registry.list();
        const canonicalEntries = await Promise.all(entries.map(async (entry) => ({entry, location: await this.canonicalize(entry.location)})));
        return canonicalEntries.filter(({location}) => location === canonicalLocation).map(({entry}) => entry);
    }

    private replace(
        entry: StudioProjectRegistryEntry,
        replacedEntries: readonly StudioProjectRegistryEntry[],
        options: {readonly isCurrent?: () => boolean} = {},
    ): Promise<boolean> {
        return this.registry.replace(entry, replacedEntries.map((replaced) => replaced.location), options);
    }

    private assertRecordOpenedCurrent(options: {readonly isCurrent?: () => boolean; readonly signal?: AbortSignal}): void {
        if (options.signal?.aborted || options.isCurrent?.() === false) {
            throw new Error("Runtime preparation was cancelled before a runnable game was available.");
        }
    }
}

function defaultProjectName(rootPath: string, type: ProjectType): string {
    return FILE_PROJECT_TYPES.has(type) ? path.basename(rootPath, path.extname(rootPath)) : path.basename(rootPath);
}
