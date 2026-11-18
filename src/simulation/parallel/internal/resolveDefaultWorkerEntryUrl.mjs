// Hand-written plain JavaScript, NOT compiled by tsc (tsc's "include": ["src"] only ever picks up
// .ts files) — copied byte-for-byte into dist/esm by build-esm:compile, landing right next to its
// compiled simulationWorkerEntry.js.
//
// Why this remains a hand-written .mjs file rather than TypeScript: the package build is ESM-only,
// but ts-jest still compiles src/ to CommonJS for Jest, and `import.meta.url` is a syntax error in
// that transform. Node always treats a `.mjs` file as an ES module regardless of the nearest
// package.json's "type" field, so `import.meta.url` is valid here in both the published ESM tree and
// Jest's CommonJS test runtime. See defaultWorkerEntryUrl.ts for how the TypeScript side loads this
// without TypeScript's dynamic-import downleveling defeating the whole point (it rewrites
// `await import(...)` into a `require(...)` call for CommonJS output, which cannot load an ES module
// file at all).
export function resolveDefaultWorkerEntryUrl() {
    return new URL("./simulationWorkerEntry.js", import.meta.url);
}
