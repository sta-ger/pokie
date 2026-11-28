import {
    loadPokieGame,
    loadPokieGameRuntime,
    PokieGamePackageValidator,
    readPokiePackageConfig,
    resolvePokieGameEntryModule,
    type LoadedPokieGame,
    type PokieGame,
    type PokieGameEntryModuleLoading,
    type ResolvedPokieGameEntryModule,
} from "@fromstan/pokie";
import fs from "fs";
import {createRequire} from "module";
import path from "path";

type DynamicModuleImporting = (entryPath: string) => Promise<Record<string, unknown>>;

// Keep this native dynamic import even when the calling Studio/CLI host is transpiled to CommonJS
// under Jest or embedded in a CommonJS process.  TypeScript otherwise rewrites `import()` to require(), which cannot load an ESM
// package entry at all and would make the Studio injection path diverge from the normal loader.
// eslint-disable-next-line no-new-func -- preserves native ESM loading in CJS/Jest hosts.
const importEntryModule: DynamicModuleImporting = (entryPath) => {
    // Do not retain a Function-created import callback at module scope. In a
    // long-lived Jest/embedded Studio host that function can outlive the VM
    // context which supplied its dynamic-import hook, producing a late
    // "Test environment has been torn down" even though the caller awaited
    // its loader promise. Construct it at the actual execution boundary so
    // each entry load binds to the current host context.
    // eslint-disable-next-line no-new-func -- preserves native ESM loading in CJS/Jest hosts.
    const nativeDynamicImport = new Function("entryPath", "return import(entryPath);") as (path: string) => Promise<Record<string, unknown>>;
    return nativeDynamicImport(entryPath);
};

// Packages produced by POKIE need its runtime at execution time, but a just-built package has no
// node_modules directory of its own. Studio already has that exact runtime loaded. When the only
// missing module is `pokie`, load the CommonJS entry with the Studio installation as that dependency;
// all other imports still resolve from the project's own location and retain Node's normal failures.
export function createStudioEntryModuleLoader(
    pokiePackageRoot: string,
    dynamicImport: DynamicModuleImporting = importEntryModule,
): PokieGameEntryModuleLoading {
    const studioRequire = createRequire(path.join(pokiePackageRoot, "package.json"));
    return async (entryPath) => {
        // CommonJS does not need native dynamic import at all. Loading it with
        // an entry-anchored require both gives its dependency graph the Studio
        // runtime overlay and avoids retaining a VM dynamic-import callback
        // across a long-lived embedded host's context boundary.
        if (dynamicImport === importEntryModule && isCommonJsEntry(entryPath)) {
            return loadCommonJsEntryWithStudioRuntime(entryPath, studioRequire);
        }
        try {
            return await dynamicImport(entryPath);
        } catch (error) {
            if (!isMissingPokieRuntime(error)) {
                throw error;
            }
            return loadCommonJsEntryWithStudioRuntime(entryPath, studioRequire);
        }
    };
}

function isCommonJsEntry(entryPath: string): boolean {
    if (path.extname(entryPath) === ".cjs") return true;
    if (path.extname(entryPath) !== ".js") return false;
    let packageRoot = path.dirname(entryPath);
    while (!fs.existsSync(path.join(packageRoot, "package.json")) && path.dirname(packageRoot) !== packageRoot) {
        packageRoot = path.dirname(packageRoot);
    }
    try {
        return JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).type !== "module";
    } catch {
        return true;
    }
}

export function createStudioGameLoader(pokiePackageRoot: string): typeof loadPokieGame {
    const loadEntryModule = createStudioEntryModuleLoader(pokiePackageRoot);
    return (packageRoot) => loadPokieGame(packageRoot, loadEntryModule);
}

// A Studio session is one project at a time, but the Dashboard load, validation and Play each used
// to call loadPokieGame() independently. Every call creates and then tears down an isolated package
// snapshot (the runtime + its whole dependency graph), so opening a small package could copy the
// same local checkout several times before the first spin. This cache keeps one leased runtime per
// unchanged project/entry and reuses it for all of those callers.
//
// It deliberately uses loadPokieGameRuntime()'s explicit lease rather than loadPokieGame(): the
// compatibility releasePokieGame(game) is then a no-op for a cached game, because the cache owns the
// lease until the project changes or Studio stops. The key is intentionally cheap (package.json and
// the declared entry's size/mtime/inode) rather than a full byte inventory; a rebuilt entry changes
// the key, while a dependency-only change is picked up by reopening Studio.
export type StudioGameRuntimeFingerprint = {
    readonly key: string;
    readonly entryPath: string;
};

function fileIdentity(filePath: string): string {
    try {
        const stats = fs.statSync(filePath);
        return `${stats.ino}:${stats.size}:${stats.mtimeMs}:${stats.ctimeMs}`;
    } catch {
        return "missing";
    }
}

export function studioGameRuntimeFingerprint(packageRoot: string): StudioGameRuntimeFingerprint {
    const resolvedRoot = path.resolve(packageRoot);
    let root = resolvedRoot;
    try {
        root = fs.realpathSync(resolvedRoot);
    } catch {
        // Missing paths still get a deterministic key; loadPokieGameRuntime() will report the real
        // failure with its own diagnostic.
    }
    let entry = "dist/index.js";
    try {
        entry = readPokiePackageConfig(root).entry;
    } catch {
        // Preserve the ordinary package-loading error; the fallback only feeds the cache key.
    }
    const entryPath = path.resolve(root, entry);
    return {
        key: [root, fileIdentity(path.join(root, "package.json")), entry, fileIdentity(entryPath)].join("|"),
        entryPath,
    };
}

export class StudioGameRuntimeCache {
    private cached: {key: string; game: PokieGame; release: () => Promise<void>} | undefined;
    private readonly pending = new Map<string, Promise<LoadedPokieGame>>();
    private disposed = false;

    public constructor(
        private readonly loadEntryModule: PokieGameEntryModuleLoading,
        private readonly loadRuntime: typeof loadPokieGameRuntime = loadPokieGameRuntime,
    ) {}

    public readonly load: typeof loadPokieGame = async (packageRoot: string): Promise<PokieGame> => {
        if (this.disposed) throw new Error("The Studio game runtime cache has been disposed.");
        const {key} = studioGameRuntimeFingerprint(packageRoot);
        if (this.cached?.key === key) return this.cached.game;

        const existing = this.pending.get(key);
        if (existing !== undefined) return (await existing).game;

        const loading = this.loadRuntime(packageRoot, this.loadEntryModule);
        this.pending.set(key, loading);
        try {
            const loaded = await loading;
            if (this.disposed) {
                await loaded.release();
                throw new Error("The Studio game runtime cache has been disposed.");
            }
            if (this.cached?.key === key) {
                await loaded.release();
                return this.cached.game;
            }
            const previous = this.cached;
            this.cached = {key, game: loaded.game, release: loaded.release};
            if (previous !== undefined) await previous.release();
            return loaded.game;
        } finally {
            this.pending.delete(key);
        }
    };

    // PokieGamePackageValidator only needs an already-resolved contract candidate. Reusing the cached
    // game avoids a second isolated snapshot for the same bytes; the no-op lease belongs to the cache.
    public async resolveEntryModule(packageRoot: string): Promise<ResolvedPokieGameEntryModule> {
        const {entryPath} = studioGameRuntimeFingerprint(packageRoot);
        const game = await this.load(packageRoot);
        return {entryPath, candidate: game, release: () => Promise.resolve()};
    }

    public async dispose(): Promise<void> {
        this.disposed = true;
        const cached = this.cached;
        this.cached = undefined;
        if (cached !== undefined) await cached.release();
        await Promise.allSettled([...this.pending.values()]);
    }
}

export function createStudioGamePackageValidator(pokiePackageRoot: string): PokieGamePackageValidator {
    const loadEntryModule = createStudioEntryModuleLoader(pokiePackageRoot);
    return new PokieGamePackageValidator((packageRoot) => resolvePokieGameEntryModule(packageRoot, loadEntryModule));
}

function isMissingPokieRuntime(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as {code?: unknown}).code === "MODULE_NOT_FOUND" &&
        (/Cannot find module ['"]@fromstan\/pokie['"]/).test(String((error as {message?: unknown}).message))
    );
}

function loadCommonJsEntryWithStudioRuntime(entryPath: string, studioRequire: NodeJS.Require): Record<string, unknown> {
    let packageRoot = path.dirname(entryPath);
    while (!fs.existsSync(path.join(packageRoot, "package.json")) && path.dirname(packageRoot) !== packageRoot) {
        packageRoot = path.dirname(packageRoot);
    }
    const dependencies = path.join(packageRoot, "node_modules");
    const injectedRuntime = path.join(dependencies, "@fromstan", "pokie");
    if (!fs.existsSync(injectedRuntime)) {
        fs.mkdirSync(path.dirname(injectedRuntime), {recursive: true});
        // The Studio runtime itself is a normal package directory. Linking it into the disposable
        // snapshot lets Node supply its own CJS wrapper, require.resolve and import callback.
        fs.symlinkSync(path.dirname(studioRequire.resolve("@fromstan/pokie")), injectedRuntime, process.platform === "win32" ? "junction" : "dir");
    }
    return createRequire(entryPath)(entryPath) as Record<string, unknown>;
}
