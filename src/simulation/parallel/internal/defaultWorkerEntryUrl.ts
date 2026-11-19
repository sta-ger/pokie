type ResolveDefaultWorkerEntryUrlModule = {
    resolveDefaultWorkerEntryUrl(): URL;
};

// Direct eval retains THIS module's location for native relative import resolution. A Function
// constructor loses that scope: Node can resolve its import relative to the coordinator instead,
// one directory above the packaged helper. Keep the fixed expression invisible to TypeScript's
// CommonJS downleveling (require cannot load this .mjs on all supported Node versions) and to
// browser bundlers inspecting the public simulation API. No caller input is evaluated.
function importResolver(): Promise<ResolveDefaultWorkerEntryUrlModule> {
    // eslint-disable-next-line no-eval -- native import must retain this module's scope in the ESM build and ts-jest's CommonJS transform.
    return eval('import("./resolveDefaultWorkerEntryUrl.mjs")') as Promise<ResolveDefaultWorkerEntryUrlModule>;
}

// Caches the in-flight/resolved promise itself, not just its eventual value — so two concurrent
// calls before the first one settles share the same import rather than racing two redundant dynamic
// imports (and, incidentally, sidesteps any read-after-await reassignment race on a plain variable).
let cachedUrlPromise: Promise<URL> | undefined;

// The default `workerEntryUrl` ParallelSimulationRunner/SimulationWorkerCoordinator use when the
// caller doesn't supply their own — resolves to this package's own compiled
// internal/simulationWorkerEntry.js beside the running ESM module. Only ever consulted when
// workers > 1 and no explicit/overriding workerEntryUrl was given, so a caller that always supplies
// one never pays for or depends on this resolution at all.
export function getDefaultWorkerEntryUrl(): Promise<URL> {
    if (!cachedUrlPromise) {
        cachedUrlPromise = importResolver().then((module) => module.resolveDefaultWorkerEntryUrl());
    }
    return cachedUrlPromise;
}
