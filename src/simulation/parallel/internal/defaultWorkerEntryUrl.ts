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
        cachedUrlPromise = importIndirect("./resolveDefaultWorkerEntryUrl.mjs").then((module) => module.resolveDefaultWorkerEntryUrl());
    }
    return cachedUrlPromise;
}
