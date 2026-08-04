const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)/;

// A deliberately minimal major.minor.patch reader, duplicated from
// externaladapter/internal/compareSemverLite.ts rather than imported across module boundaries -- "internal"
// directories are private to their own module by this package's own convention (every other module with its
// own internal/ folder owns its own copy of anything it needs from a sibling module's internal/), so wasm/
// owns its own copy instead of reaching into externaladapter's.
export function isValidSemverLite(version: string): boolean {
    return VERSION_PATTERN.test(version.trim());
}

// Parses a "major.minor.patch"-leading string's own leading major segment -- what
// assessWasmComponentCompatibility compares a manifest's own "schemaVersion" against
// POKIE_WASM_CONTRACT_VERSION with (major-only, not full equality -- see that function's own doc comment for
// why). Returns undefined for a string isValidSemverLite itself would reject; never throws.
export function majorVersionOf(version: string): number | undefined {
    const parsed = VERSION_PATTERN.exec(version.trim());
    return parsed === null ? undefined : Number(parsed[1]);
}
