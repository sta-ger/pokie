// Hand-written plain JavaScript, NOT compiled by tsc (tsc's "include": ["src"] only ever picks up
// .ts files) — copied byte-for-byte into both dist/esm and dist/cjs by the build-esm/build-cjs npm
// scripts, landing right next to the compiled simulationWorkerEntry.js in either tree.
//
// Why this needs to be its own hand-written .mjs file rather than plain TypeScript: this package
// compiles the exact same src/ tree twice, once per module target (dist/esm as real ECMAScript
// modules, dist/cjs as CommonJS) — and `import.meta.url` is the only reliable way to find "my own
// directory" at runtime, but it's also a syntax TypeScript flatly refuses to emit when targeting
// CommonJS (a compile error, not a runtime one, so it can't be guarded by a runtime check either).
// A `.mjs` file sidesteps this entirely: Node always treats a `.mjs` file as an ES module regardless
// of the nearest package.json's "type" field, so `import.meta.url` is valid here no matter which of
// the two dist trees this particular copy ends up in. See defaultWorkerEntryUrl.ts for how the
// (CommonJS-compiled-or-not) TypeScript side loads this without TypeScript's own dynamic-import
// downleveling defeating the whole point (it rewrites `await import(...)` into a `require(...)` call
// for CommonJS output, which cannot load an ES module file at all).
export function resolveDefaultWorkerEntryUrl() {
    return new URL("./simulationWorkerEntry.js", import.meta.url);
}
