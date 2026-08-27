type ResolveDefaultWorkerEntryUrlModule = {
    resolveDefaultWorkerEntryUrl(): URL;
};

// An *indirect* dynamic import — built at runtime via the Function constructor rather than written
// as a literal `import(...)` expression — specifically so TypeScript never sees a static import
// expression to "helpfully" downlevel. For a CommonJS compilation target, TS rewrites a literal
// `await import(specifier)` into a synchronous `require(specifier)` call, which throws
// ERR_REQUIRE_ESM for an .mjs file — defeating the entire reason for reaching for a real dynamic
// import in the first place (see resolveDefaultWorkerEntryUrl.mjs's own comment). Hiding the
// expression inside a runtime-constructed function body is invisible to TS's compiler, so this one
// line behaves identically (a genuine, native dynamic import, capable of loading a real ES module)
// whether this file itself was compiled to dist/esm or dist/cjs.
// eslint-disable-next-line no-new-func -- the standard, narrowly-scoped workaround for TS's CommonJS dynamic-import downleveling; see comment above.
const importIndirect = new Function("specifier", "return import(specifier)") as (
    specifier: string,
) => Promise<ResolveDefaultWorkerEntryUrlModule>;

// Like resolvePokieGameEntryModule's CommonJS entry fallback, this is only for Jest's VM: it does
// not provide a dynamic-import callback, so even the deliberately indirect native import above
// rejects before resolving this module. The normal path remains native import, because the .mjs
// resolver is what lets the same source work in both the ESM and CommonJS package builds.
//
// Keep Node builtins out of this module's static dependency graph. This internal resolver is
// reachable from the public package root, and browser bundlers must not discover a Node-only
// dependency merely because they inspect the simulation API.
// eslint-disable-next-line no-new-func -- keeps the CommonJS-only fallback out of browser bundles.
const resolveCommonJsWorkerEntryUrl = new Function(
    "nodeRequire",
    "dirname",
    "const {pathToFileURL} = nodeRequire('url'); const path = nodeRequire('path'); return pathToFileURL(path.join(dirname, 'simulationWorkerEntry.js'));",
) as (nodeRequire: NodeRequire, dirname: string) => URL;

// Caches the in-flight/resolved promise itself, not just its eventual value — so two concurrent
// calls before the first one settles share the same import rather than racing two redundant dynamic
// imports (and, incidentally, sidesteps any read-after-await reassignment race on a plain variable).
let cachedUrlPromise: Promise<URL> | undefined;

// The default `workerEntryUrl` ParallelSimulationRunner/SimulationWorkerCoordinator use when the
// caller doesn't supply their own — resolves to this package's own compiled
// internal/simulationWorkerEntry.js, in whichever of dist/esm or dist/cjs is actually running. Only
// ever consulted when workers > 1 and no explicit/overriding workerEntryUrl was given, so a caller
// that always supplies one (every existing test, for instance) never pays for or depends on this
// resolution at all.
export function getDefaultWorkerEntryUrl(): Promise<URL> {
    if (!cachedUrlPromise) {
        // Jest's VM tears down before a native dynamic import can settle when it is exercised late
        // in a large in-band run. Its CommonJS test transform always supplies `require` and
        // `__dirname`, so select the existing synchronous fallback before starting that import.
        cachedUrlPromise = isJestRuntime() && typeof require === "function" && typeof __dirname === "string"
            ? Promise.resolve(resolveCommonJsWorkerEntryUrl(require, __dirname))
            : importIndirect("./resolveDefaultWorkerEntryUrl.mjs")
                .then((module) => module.resolveDefaultWorkerEntryUrl())
                .catch((error: unknown) => {
                    if (!isVmDynamicImportUnavailable(error) || typeof require !== "function" || typeof __dirname !== "string") {
                        throw error;
                    }
                    return resolveCommonJsWorkerEntryUrl(require, __dirname);
                });
    }
    return cachedUrlPromise;
}

function isJestRuntime(): boolean {
    return typeof process !== "undefined" && process.env?.JEST_WORKER_ID !== undefined;
}

function isVmDynamicImportUnavailable(error: unknown): boolean {
    return (
        typeof error === "object" &&
        error !== null &&
        (error as {code?: unknown}).code === "ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING_FLAG"
    );
}
