type ResolveDefaultWorkerEntryUrlModule = {
    resolveDefaultWorkerEntryUrl(): URL;
};

// Direct eval retains THIS module's location for native relative import resolution. A Function
// constructor loses that scope: Node can resolve its import relative to the coordinator instead,
// one directory above the packaged helper. Keep the fixed expression invisible to TypeScript's
// CommonJS downleveling (require cannot load this .mjs on all supported Node versions) and to
// browser bundlers inspecting the public simulation API. No caller input is evaluated.
function importResolver(): Promise<ResolveDefaultWorkerEntryUrlModule> {
    // eslint-disable-next-line no-eval -- native import must retain this module's scope in ESM and CJS.
    return eval('import("./resolveDefaultWorkerEntryUrl.mjs")') as Promise<ResolveDefaultWorkerEntryUrlModule>;
}

// Like resolvePokieGameEntryModule's CommonJS entry fallback, this is only for Jest's VM: it does
// not provide a dynamic-import callback, so even the scoped native import above
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
// that always supplies one never pays for or depends on this
// resolution at all.
export function getDefaultWorkerEntryUrl(): Promise<URL> {
    if (!cachedUrlPromise) {
        // Jest's VM tears down before a native dynamic import can settle when it is exercised late
        // in a large in-band run. Its CommonJS test transform always supplies `require` and
        // `__dirname`, so select the existing synchronous fallback before starting that import.
        cachedUrlPromise = isJestRuntime() && typeof require === "function" && typeof __dirname === "string"
            ? Promise.resolve(resolveCommonJsWorkerEntryUrl(require, __dirname))
            : importResolver()
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
