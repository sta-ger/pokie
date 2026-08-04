// One Node.js built-in module import/require found by scanForBlockingNodeApiUsage -- a concrete, named reason
// a package can't be dropped straight into a WASM/component-model sandbox as-is (no such sandbox has access to
// Node's own built-in modules).
export type WasmPackagingBlockingApiUsage = {
    readonly module: string;
    // Relative to the scanned project's own rootPath.
    readonly filePath: string;
    readonly line: number;
};

// What assessWasmPackagingPreflight reports for a "tsPackage" project -- advisory only (see that function's
// own doc comment): named Node built-in usages it actually found, the package's own declared runtime
// dependencies (for a human to review -- POKIE has no way to know whether any given third-party dependency is
// itself WASM/browser-portable), and "notes" always carrying ArtifactBuilderRegistry's own "wasm" descriptor
// unsupportedNotes verbatim, so this report can never be read as "no blockers found, therefore compilation
// works" -- POKIE has no arbitrary package-to-WASM compiler regardless of what a scan finds.
export type WasmPackagingPreflightReport = {
    readonly rootPath: string;
    readonly blockingApiUsages: readonly WasmPackagingBlockingApiUsage[];
    readonly declaredDependencies: readonly string[];
    readonly notes: readonly string[];
};
