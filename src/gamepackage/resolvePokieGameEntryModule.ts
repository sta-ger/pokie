import {isPokieGame} from "./isPokieGame.js";
import {readPokiePackageConfig} from "./readPokiePackageConfig.js";
import fs from "fs";
import {createRequire} from "module";
import os from "os";
import path from "path";
import {fileURLToPath, pathToFileURL} from "url";
import {Worker} from "worker_threads";

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

// Native import is the ordinary path: it is required for ESM game packages and also loads
// CommonJS entries. Some embedded VM hosts reject file URLs outright; the snapshot's ordinary
// absolute specifier still prevents either loader from reusing old dependencies.
async function importPokieGameEntryModule(entryPath: string): Promise<Record<string, unknown>> {
    try {
        return (await import(pathToFileURL(entryPath).href)) as Record<string, unknown>;
    } catch (error) {
        // Some embedded VM hosts reject file URLs outright. Fall back to the
        // snapshot's ordinary absolute specifier there; its invocation-owned
        // path still prevents either loader from reusing old dependencies.
        if (isModuleNotFoundError(error) && errorMessage(error).includes("file://")) {
            return (await import(entryPath)) as Record<string, unknown>;
        }
        throw error;
    }
}

async function createRuntimeSnapshot(packageRoot: string, entryPath: string): Promise<{root: string; entryPath: string; release: () => Promise<void>}> {
    // `entryPath` may be inside a nested module-type scope (for example a nested
    // package.json that changes how Node interprets a generated directory). That
    // file controls module type, not what belongs to the game package. The resolver
    // has already identified the canonical package root from its `pokie.entry`;
    // snapshot that complete package so root assets and declared dependencies remain
    // available.
    const relativeEntry = path.relative(packageRoot, entryPath);
    if (relativeEntry.startsWith(`..${path.sep}`) || path.isAbsolute(relativeEntry)) {
        throw new Error(`Could not locate package root for entry "${entryPath}".`);
    }
    // Never put loader state inside the package being read: project input hashes and atomic
    // conversion plans correctly treat every package-root byte as authored source. An external
    // snapshot directory would otherwise fabricate source drift between preflight and execution.
    const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "pokie-runtime-"));
    try {
        const copier = createRuntimePackageCopier();
        try {
            await copier.copy(packageRoot, root);
            // Copy the resolved graph as well as the entry. Symlinks to the installation reuse
            // Node's realpath-keyed CJS/ESM caches even when disk fingerprints have changed.
            await snapshotPokieGameDependencies(root, packageRoot, copier.copy);
        } finally {
            // No game import, successful return or failed-snapshot cleanup may outlive this worker.
            await copier.close();
        }
        const snapshotEntry = path.join(root, relativeEntry);
        let releasing: Promise<void> | undefined;
        return {
            root,
            entryPath: snapshotEntry,
            release: () => {
                if (releasing !== undefined) return releasing;
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
                releasing = fs.promises.rm(root, {recursive: true, force: true});
                return releasing;
            },
        };
    } catch (error) {
        await fs.promises.rm(root, {recursive: true, force: true});
        throw error;
    }
}

type RuntimePackageCopying = (source: string, destination: string) => Promise<void>;

function createRuntimePackageCopier(): {copy: RuntimePackageCopying; close(): Promise<void>} {
    // Keep Node's existing recursive-copy semantics and throughput, off the serving event loop.
    // Only filesystem copying runs here: dependency resolution and runtime validation stay with
    // their existing owners. One worker serves this invocation's entire graph, then is drained.
    const worker = new Worker(`
const fs = require('node:fs'), path = require('node:path'), {parentPort} = require('node:worker_threads');
parentPort.on('message', async ({source, destination}) => {
    const pending = new Set();
    let failure;
    // Parallelize independent file I/O, but bound both libuv work and retained promises.
    // Observe failures immediately and drain every started write before replying: the
    // owner may remove the snapshot as soon as it receives a rejection.
    const schedule = async operation => {
        if (failure) throw failure;
        const task = operation().catch(error => { failure ??= error; }).finally(() => pending.delete(task));
        pending.add(task);
        if (pending.size >= 32) await Promise.race(pending);
        if (failure) throw failure;
    };
    try {
        fs.mkdirSync(destination, {recursive: true});
        const realSource = fs.realpathSync(source), realDestination = fs.realpathSync(destination);
        // The destination is private and new. cpSync's per-file source/destination
        // ancestry and overwrite checks repeat thousands of filesystem operations
        // for every SDK acquisition. Walk each directory once; copy regular files
        // directly, retaining their bytes, modes and timestamps (including stale-
        // build checks). Keep cpSync's link/special-file semantics at that boundary.
        const copyDirectory = async (from, to) => {
            for (const entry of fs.readdirSync(from, {withFileTypes: true})) {
                // TMPDIR may be below node_modules. Exclude before recursion.
                if (['node_modules', '.git', '.pokie-runtime-cache'].includes(entry.name)) continue;
                const input = path.join(from, entry.name), output = path.join(to, entry.name);
                if (entry.isDirectory()) {
                    const nestedDestination = path.relative(path.join(realSource, path.relative(source, input)), realDestination);
                    if (nestedDestination === '' || (nestedDestination !== '..' && !nestedDestination.startsWith('..' + path.sep) && !path.isAbsolute(nestedDestination))) {
                        throw new Error('Cannot copy a runtime package into its own source directory: ' + input);
                    }
                    const mode = fs.statSync(input).mode | 0o700;
                    fs.mkdirSync(output, {mode});
                    // Read-only installations stay untouched; only owned directories
                    // become writable for dependency links and recursive release.
                    fs.chmodSync(output, mode);
                    await copyDirectory(input, output);
                } else if (entry.isFile() && process.platform !== 'win32') {
                    const stats = fs.statSync(input);
                    await schedule(async () => {
                        await fs.promises.copyFile(input, output, fs.constants.COPYFILE_FICLONE);
                        await fs.promises.utimes(output, stats.atime, stats.mtime);
                    });
                } else {
                    await schedule(() => fs.promises.cp(input, output, {recursive: true, preserveTimestamps: true, mode: fs.constants.COPYFILE_FICLONE}));
                }
            }
        };
        await copyDirectory(source, destination);
        await Promise.all(pending);
        if (failure) throw failure;
        parentPort.postMessage({});
    } catch (error) {
        await Promise.all(pending);
        parentPort.postMessage({error: {message: error.message, name: error.name, code: error.code}});
    }
});`, {eval: true, execArgv: []});
    let pending: {resolve(): void; reject(error: Error): void} | undefined;
    let failure: Error | undefined;
    worker.on("message", (result: {error?: {message: string; name: string; code?: string}}) => {
        const completion = pending;
        pending = undefined;
        if (result.error) completion?.reject(Object.assign(new Error(result.error.message), {name: result.error.name, code: result.error.code}));
        else completion?.resolve();
    });
    worker.on("error", (error: Error) => {
        failure = error;
        pending?.reject(error);
        pending = undefined;
    });
    worker.on("exit", code => {
        failure ??= new Error(`Runtime snapshot copier stopped (exit ${code}).`);
        pending?.reject(failure);
        pending = undefined;
    });
    return {
        copy: (source, destination) => new Promise<void>((resolve, reject) => {
            if (failure !== undefined) {
                reject(failure);
                return;
            }
            pending = {resolve, reject};
            worker.postMessage({source, destination});
        }),
        close: async () => {
            await worker.terminate();
        },
    };
}

/** Private paths for the entire installed runtime graph, including cycles and peers.
 * Keep the detachable candidate's overlay separate: it binds publication to the installation;
 * only an executing runtime owns these copies and their cache entries.
 */
async function snapshotPokieGameDependencies(snapshotRoot: string, packageRoot: string, copyRuntimePackage: RuntimePackageCopying): Promise<void> {
    const copies = new Map<string, string>([[await fs.promises.realpath(packageRoot), snapshotRoot]]);
    const storage = path.join(snapshotRoot, "node_modules", ".pokie-runtime-dependencies");
    await fs.promises.mkdir(storage, {recursive: true});
    const copy = async (source: string): Promise<string> => {
        const existing = copies.get(source);
        if (existing !== undefined) return existing;
        const destination = path.join(storage, String(copies.size));
        copies.set(source, destination);
        await copyRuntimePackage(source, destination);
        await linkDependencies(destination, await resolvePokieGameDependencyRoots(source, false));
        return destination;
    };
    const linkDependencies = async (owner: string, dependencies: Record<string, string | null>): Promise<void> => {
        for (const [name, source] of Object.entries(dependencies)) {
            if (source === null) continue;
            const target = await copy(source);
            const link = path.join(owner, "node_modules", name);
            await fs.promises.mkdir(path.dirname(link), {recursive: true});
            await fs.promises.symlink(target, link, process.platform === "win32" ? "junction" : "dir");
        }
    };
    await linkDependencies(snapshotRoot, await resolvePokieGameDependencyRoots(packageRoot));
}

/** Bind declared dependencies to the source installation when detaching a package. */
export async function createPokieGameDependencyOverlay(snapshotRoot: string, startPath: string): Promise<void> {
    const roots = await resolvePokieGameDependencyRoots(startPath);
    const overlay = path.join(snapshotRoot, "node_modules");
    fs.mkdirSync(overlay);
    for (const [dependencyName, source] of Object.entries(roots)) {
        if (source === null) continue;
        const destination = path.join(overlay, dependencyName);
        fs.mkdirSync(path.dirname(destination), {recursive: true});
        fs.symlinkSync(source, destination, process.platform === "win32" ? "junction" : "dir");
    }
}

/** The exact dependency roots used by the loader overlay, including its host-runtime fallback. */
export async function resolvePokieGameDependencyRoots(startPath: string, includeHostRuntime = true): Promise<Record<string, string | null>> {
    const dependencyRoots: string[] = [];
    let current = startPath;
    while (path.dirname(current) !== current) {
        const candidate = path.join(current, "node_modules");
        if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) dependencyRoots.push(candidate);
        current = path.dirname(current);
    }
    // Resolve only declared runtime dependencies, never every ancestor workspace entry.
    // Both the detachable overlay and isolated execution graph use this resolution authority.
    // `@fromstan/pokie` is the host runtime contract for a generated package.  Older
    // package fixtures and packages built before dependency metadata was
    // standardized may omit it from package.json, yet were loadable from a
    // normal workspace ancestor. Keep that single compatibility dependency;
    // every other overlay entry remains manifest-declared.
    const declaredDependencies = declaredRuntimeDependencies(startPath);
    const hostRuntimeRoot = includeHostRuntime ? await resolveHostPokieRuntimeRoot() : undefined;
    const roots: Record<string, string | null> = {};
    for (const dependencyName of [...new Set([...(includeHostRuntime ? ["@fromstan/pokie"] : []), ...declaredDependencies])].sort()) {
        // An explicit package dependency remains authoritative. The compatibility `pokie`
        // overlay for old packages that omit it is different: bind that name to the embedding
        // runtime first, so a stray legacy/local `node_modules/@fromstan/pokie` cannot make a worker load a
        // source checkout rather than the installed API that created it.
        const hostRuntime = dependencyName === "@fromstan/pokie" && !declaredDependencies.includes("@fromstan/pokie")
            ? hostRuntimeRoot
            : undefined;
        // A game package is permitted to omit its host runtime from its own ancestry: for
        // example, an embedding application can load a fixture outside its install tree. In that
        // layout the snapshot still must bind `require("@fromstan/pokie")` to the *same installed runtime*
        // that invoked the loader, rather than assuming the fixture's source checkout has a
        // sibling node_modules/@fromstan/pokie. This is especially important in worker_threads, whose loader
        // starts from the snapshot path and otherwise loses the embedding app's resolution chain.
        const source = hostRuntime
            ?? dependencyRoots.map((dependencyRoot) => path.join(dependencyRoot, dependencyName)).find((candidate) => fs.existsSync(candidate))
            ?? (dependencyName === "@fromstan/pokie" ? hostRuntimeRoot : undefined);
        roots[dependencyName] = source === undefined ? null : fs.realpathSync(source);
    }
    return roots;
}

async function resolveHostPokieRuntimeRoot(): Promise<string | undefined> {
    // Bind omitted runtime dependencies to the installation executing this loader, even when a
    // global CLI or embedding application opens a project outside its own node_modules ancestry.
    // Explicit dependencies are resolved from the project's ancestry before this fallback is used.
    if (typeof __filename === "string") return findHostInstallationRoot(__filename);
    // A native import preserves the ESM location helper when TypeScript also emits this source as CJS.
    // eslint-disable-next-line no-new-func -- the helper must retain import.meta in both compiled trees.
    const locate = new Function("return import('./internal/runtimeLocation.mjs')") as () => Promise<{runtimeLocation(): string}>;
    return findHostInstallationRoot(fileURLToPath((await locate()).runtimeLocation()));
}

function findHostInstallationRoot(filePath: string): string | undefined {
    let installationRoot: string | undefined;
    let current = path.dirname(filePath);
    // The enclosing installation owns exports, assets and runtime dependencies.
    // Keep that entire installation as the shared overlay/copy/revision authority.
    // Stop at node_modules so a containing application's manifests cannot replace it.
    while (path.dirname(current) !== current && path.basename(current) !== "node_modules") {
        const manifestPath = path.join(current, "package.json");
        if (fs.existsSync(manifestPath)) {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {name?: string};
            if (manifest.name === "@fromstan/pokie") installationRoot = current;
        }
        current = path.dirname(current);
    }
    return installationRoot;
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
    const snapshot = await createRuntimeSnapshot(packageRoot, entryPath);
    let entryModule: Record<string, unknown>;
    try {
        // A plain absolute path, not a file:// URL: TypeScript downlevels `import()` to
        // `require()` in ts-jest's CommonJS transform, and require() does not accept file://
        // URLs as module specifiers.
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
