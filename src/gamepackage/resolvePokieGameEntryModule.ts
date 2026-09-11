import {isPokieGame} from "./isPokieGame.js";
import {readPokiePackageConfig} from "./readPokiePackageConfig.js";
import fs from "fs";
import {createRequire} from "module";
import os from "os";
import path from "path";
import {pathToFileURL} from "url";

export type ResolvedPokieGameEntryModule = {
    entryPath: string;
    candidate: unknown;
    // The executable module is loaded from an invocation-owned snapshot so a long-lived process
    // cannot accidentally retain yesterday's relative ESM/CJS dependency graph.  Consumers which
    // retain `candidate` for later execution must retain this lease too; inspection-only callers
    // release it as soon as they have read the metadata they need.
    release: () => Promise<void>;
};

// Kept injectable for hosts such as Studio that can supply the POKIE runtime to an otherwise complete
// external package before its own dependencies have been installed. The ordinary loader remains the
// default for every library/CLI caller.
export type PokieGameEntryModuleLoading = (entryPath: string) => Promise<Record<string, unknown>>;

// Jest executes source modules inside a VM context. Node deliberately rejects native dynamic
// imports from that context unless Jest itself was started with --experimental-vm-modules, even
// when the requested entry is an ordinary CommonJS game package. Keep native import as the normal
// path (it is required for ESM game packages), with a narrowly scoped CommonJS fallback for that
// host limitation. createRequire is anchored at the entry so its transitive dependencies resolve
// exactly as they would for a consumer loading that package directly.
async function importPokieGameEntryModule(entryPath: string): Promise<Record<string, unknown>> {
    const entryRequire = createRequire(entryPath);
    try {
        return (await import(pathToFileURL(entryPath).href)) as Record<string, unknown>;
    } catch (error) {
        // Some embedded VM hosts reject file URLs outright. Fall back to the
        // snapshot's ordinary absolute specifier there; its invocation-owned
        // path still prevents either loader from reusing old dependencies.
        if (isModuleNotFoundError(error) && errorMessage(error).includes("file://")) {
            return (await import(entryPath)) as Record<string, unknown>;
        }
        if (!isVmDynamicImportUnavailable(error)) {
            throw error;
        }
        return entryRequire(entryPath) as Record<string, unknown>;
    }
}

function createRuntimeSnapshot(entryPath: string): {root: string; entryPath: string; release: () => Promise<void>} {
    let packageRoot = path.dirname(entryPath);
    while (path.dirname(packageRoot) !== packageRoot) {
        if (fs.existsSync(path.join(packageRoot, "package.json"))) break;
        packageRoot = path.dirname(packageRoot);
    }
    const relativeEntry = path.relative(packageRoot, entryPath);
    if (relativeEntry.startsWith(`..${path.sep}`) || path.isAbsolute(relativeEntry)) {
        throw new Error(`Could not locate package root for entry "${entryPath}".`);
    }
    // Never put loader state inside the package being read: project input hashes and atomic
    // conversion plans correctly treat every package-root byte as authored source. An external
    // snapshot directory would otherwise fabricate source drift between preflight and execution.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-runtime-"));
    try {
        for (const name of fs.readdirSync(packageRoot)) {
            if (name === "node_modules" || name === ".pokie-runtime-cache") continue;
            fs.cpSync(path.join(packageRoot, name), path.join(root, name), {recursive: true});
        }
        // A package may legitimately inherit its runtime dependency from a parent workspace
        // node_modules directory (fixtures and Studio materializations do). Keep that normal
        // Node resolution chain available from the external snapshot without copying dependencies
        // or writing anything into the authored package.
        createDependencyOverlay(root, packageRoot);
        const snapshotEntry = path.join(root, relativeEntry);
        let released = false;
        return {
            root,
            entryPath: snapshotEntry,
            release: () => {
                if (released) return Promise.resolve();
                released = true;
                // CommonJS keeps its own module objects forever unless their cache entries are
                // explicitly forgotten.  Removing precisely this snapshot's entries means a
                // repeated load cannot grow require.cache while leaving unrelated application
                // modules untouched.  ESM's URL cache cannot be purged, but its modules have
                // snapshot-only URLs and become unreachable after the caller releases them.
                const cache = createRequire(snapshotEntry).cache;
                for (const cachedPath of Object.keys(cache)) {
                    if (cachedPath === root || cachedPath.startsWith(`${root}${path.sep}`)) {
                        Reflect.deleteProperty(cache, cachedPath);
                    }
                }
                fs.rmSync(root, {recursive: true, force: true});
                return Promise.resolve();
            },
        };
    } catch (error) {
        fs.rmSync(root, {recursive: true, force: true});
        throw error;
    }
}

function createDependencyOverlay(snapshotRoot: string, startPath: string): void {
    const overlay = path.join(snapshotRoot, "node_modules");
    const dependencyRoots: string[] = [];
    let current = startPath;
    while (path.dirname(current) !== current) {
        const candidate = path.join(current, "node_modules");
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) dependencyRoots.push(candidate);
        current = path.dirname(current);
    }
    if (dependencyRoots.length === 0) return;
    fs.mkdirSync(overlay);
    // Link only the package's declared runtime dependencies, never every entry in an ancestor
    // workspace node_modules.  The linked package keeps its physical nested dependency tree, so
    // Node resolves its transitive dependencies normally without a recursive copy or overlay scan.
    // `pokie` is the host runtime contract for a generated package.  Older
    // package fixtures and packages built before dependency metadata was
    // standardized may omit it from package.json, yet were loadable from a
    // normal workspace ancestor. Keep that single compatibility dependency;
    // every other overlay entry remains manifest-declared.
    for (const dependencyName of new Set(["pokie", ...declaredRuntimeDependencies(startPath)])) {
        const source = dependencyRoots.map((dependencyRoot) => path.join(dependencyRoot, dependencyName)).find((candidate) => fs.existsSync(candidate));
        if (source === undefined) continue;
        const destination = path.join(overlay, dependencyName);
        fs.mkdirSync(path.dirname(destination), {recursive: true});
        fs.symlinkSync(source, destination, process.platform === "win32" ? "junction" : "dir");
    }
}

function declaredRuntimeDependencies(packageRoot: string): string[] {
    try {
        const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf-8")) as {
            dependencies?: Record<string, unknown>;
            optionalDependencies?: Record<string, unknown>;
            peerDependencies?: Record<string, unknown>;
        };
        return Array.from(new Set([
            ...Object.keys(manifest.dependencies ?? {}),
            ...Object.keys(manifest.optionalDependencies ?? {}),
            ...Object.keys(manifest.peerDependencies ?? {}),
        ]));
    } catch {
        return [];
    }
}

export async function resolvePokieGameEntryModule(
    packageRoot: string,
    loadEntryModule: PokieGameEntryModuleLoading = importPokieGameEntryModule,
): Promise<ResolvedPokieGameEntryModule> {
    const {entry} = readPokiePackageConfig(packageRoot);
    const entryPath = path.resolve(packageRoot, entry);

    // Checked up front, rather than left to surface as Node's own raw "Cannot find module" once
    // import() below fails: the single most common reason an entry module doesn't resolve is that
    // this package's build output is simply missing (never built, or the dist directory was
    // removed) -- a fixable, actionable state, not a real load failure. This is still just a read,
    // same as readPokiePackageConfig's own fs.readFileSync above -- resolvePokieGameEntryModule
    // itself never runs npm install/build on the caller's behalf.
    if (!fs.existsSync(entryPath)) {
        throw new Error(
            `Entry module "${entryPath}" (from "pokie.entry": "${entry}" in "${packageRoot}/package.json") does not ` +
                `exist. This package hasn't been built yet -- run "npm install && npm run build" in "${packageRoot}" ` +
                `to build it, then retry.`,
        );
    }

    // A canonical package (as `pokie create` scaffolds one) compiles "src/**/*.ts" into a *separate*
    // dist entry checked above via "npm run build" (tsc); a package without a "src" directory at all
    // (e.g. a hand-authored plain-JS entry, as several fixtures in this suite are) was never built
    // from TypeScript source in the first place, so there's nothing to compare it against here.
    // Editing source without rebuilding leaves the dist entry on disk and loadable -- import() below
    // would otherwise silently succeed against that now-stale output instead of surfacing the
    // mismatch as a fixable, actionable state.
    //
    // A `pokie build`-generated package (GamePackageGenerator) is a different shape entirely: its
    // entry lives *inside* "src/generated/index.js" itself, self-contained, with no separate compile
    // step -- "src/generated/build-info.json" is published right alongside it (and can legitimately
    // land a beat later on disk), which would otherwise make a freshly generated package look "stale"
    // against its own sibling file. Comparing is only meaningful when entryPath sits outside
    // sourceRoot -- i.e. a real dist/src split -- so entries inside sourceRoot skip this check.
    const sourceRoot = path.join(packageRoot, "src");
    const entryIsOutsideSourceRoot = path.relative(sourceRoot, entryPath).startsWith(`..${path.sep}`);
    if (entryIsOutsideSourceRoot && fs.existsSync(sourceRoot)) {
        const latestSourceMtimeMs = findLatestFileMtimeMs(sourceRoot);
        const entryMtimeMs = fs.statSync(entryPath).mtimeMs;
        if (latestSourceMtimeMs !== null && latestSourceMtimeMs > entryMtimeMs) {
            throw new Error(
                `Entry module "${entryPath}" (from "pokie.entry": "${entry}" in "${packageRoot}/package.json") is ` +
                    `stale -- its source in "${sourceRoot}" has changed since it was last built. Run "npm run build" ` +
                    `in "${packageRoot}" to rebuild it, then retry.`,
            );
        }
    }

    // Both Node loaders cache *dependencies* independently of an entry.  Load every invocation
    // from a whole-package snapshot so an entry and all of its relative dependencies agree on one
    // immutable version.  Crucially, the snapshot is *not* removed after import: a game may read
    // model.json or lazily import/require a sibling while a session is still live.  Its owner gets
    // the release lease returned below.
    const snapshot = createRuntimeSnapshot(entryPath);
    let entryModule: Record<string, unknown>;
    try {
        // A plain absolute path, not a file:// URL: TypeScript downlevels `import()` to
        // `require()` in the CJS build (dist/cjs and ts-jest both compile to CommonJS), and
        // require() does not accept file:// URLs as module specifiers.
        entryModule = await loadEntryModule(snapshot.entryPath);
    } catch (error) {
        await snapshot.release();
        if (isModuleNotFoundError(error)) {
            // entryPath itself exists (checked above), so this is a *different* module the entry
            // file itself requires that can't be found -- almost always a stale/incomplete build
            // (e.g. dependencies were never installed, or dist wasn't rebuilt after an import was
            // added) rather than a mundane load failure.
            const underlying = errorMessage(error);
            throw new Error(
                `Entry module "${entryPath}" (from "pokie.entry": "${entry}" in "${packageRoot}/package.json") could ` +
                    `not be loaded -- it looks stale or incomplete: "${underlying}". Run "npm install && npm run build" ` +
                    `in "${packageRoot}" to rebuild it against its current dependencies, then retry.`,
            );
        }
        throw error;
    }

    const firstLevelCandidate = entryModule.default ?? entryModule;
    // Node's native ESM loader wraps a CommonJS module's whole `module.exports` as `.default`,
    // on top of the `exports.default` that tsc's esModuleInterop already emitted for `export
    // default` — so importing a tsc-compiled entry module here can yield `entryModule.default.default`
    // instead of `entryModule.default`. Unwrap one more level in that case.
    const nestedDefault = (firstLevelCandidate as Record<string, unknown> | null)?.default;
    const candidate =
        isPokieGame(firstLevelCandidate) || !isPokieGame(nestedDefault) ? firstLevelCandidate : nestedDefault;

    return {entryPath, candidate, release: snapshot.release};
}

// Deliberately not an `instanceof Error` check: dynamic `import()` of a real on-disk module runs
// through Node's own module loader rather than the caller's own realm (jest, for one, runs each test
// file in its own vm context), so an error it throws can be a genuine Error whose prototype chain
// still doesn't match this module's own `Error` global. Both `.code` and `.message` are plain own
// properties, unaffected by that.
function isModuleNotFoundError(error: unknown): boolean {
    return typeof error === "object" && error !== null && (error as {code?: unknown}).code === "MODULE_NOT_FOUND";
}

function isVmDynamicImportUnavailable(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as {code?: unknown}).code === "ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG"
    );
}

// null (rather than -Infinity/0) when sourceRoot contains no files at all, so an empty "src"
// directory can never be treated as newer than a real dist entry.
function findLatestFileMtimeMs(dir: string): number | null {
    let latestMtimeMs: number | null = null;
    for (const dirEntry of fs.readdirSync(dir, {withFileTypes: true})) {
        const childPath = path.join(dir, dirEntry.name);
        let childLatestMtimeMs: number | null = null;
        if (dirEntry.isDirectory()) {
            childLatestMtimeMs = findLatestFileMtimeMs(childPath);
        } else if (dirEntry.isFile()) {
            childLatestMtimeMs = fs.statSync(childPath).mtimeMs;
        }
        if (childLatestMtimeMs !== null && (latestMtimeMs === null || childLatestMtimeMs > latestMtimeMs)) {
            latestMtimeMs = childLatestMtimeMs;
        }
    }
    return latestMtimeMs;
}

function errorMessage(error: unknown): string {
    if (typeof error === "object" && error !== null && typeof (error as {message?: unknown}).message === "string") {
        return (error as {message: string}).message;
    }
    return String(error);
}
