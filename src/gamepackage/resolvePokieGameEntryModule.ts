import {isPokieGame} from "./isPokieGame.js";
import {readPokiePackageConfig} from "./readPokiePackageConfig.js";
import fs from "fs";
import path from "path";

export type ResolvedPokieGameEntryModule = {
    entryPath: string;
    candidate: unknown;
};

// Kept injectable for hosts such as Studio that can supply the POKIE runtime to an otherwise complete
// external package before its own dependencies have been installed. The ordinary loader remains the
// default for every library/CLI caller.
export type PokieGameEntryModuleLoading = (entryPath: string) => Promise<Record<string, unknown>>;

export async function resolvePokieGameEntryModule(
    packageRoot: string,
    loadEntryModule: PokieGameEntryModuleLoading = (entryPath) => import(entryPath) as Promise<Record<string, unknown>>,
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

    let entryModule: Record<string, unknown>;
    try {
        // A plain absolute path, not a file:// URL: TypeScript downlevels `import()` to
        // `require()` in the CJS build (dist/cjs and ts-jest both compile to CommonJS), and
        // require() does not accept file:// URLs as module specifiers.
        entryModule = await loadEntryModule(entryPath);
    } catch (error) {
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

    return {entryPath, candidate};
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
