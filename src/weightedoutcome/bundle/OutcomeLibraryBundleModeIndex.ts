// Tracks this type's own shape (not the pokie package version), same convention as
// OUTCOME_LIBRARY_BUNDLE_MANIFEST_SCHEMA_VERSION.
export const OUTCOME_LIBRARY_BUNDLE_MODE_INDEX_SCHEMA_VERSION = 1;

// One outcome's position inside "outcomes_<modeName>.jsonl" — carries "weight" directly (not just the byte
// range) so a weighted draw only ever needs this small index, never the outcomes file itself, until exactly one
// winning outcome has been picked.
export type OutcomeLibraryBundleIndexEntry = {
    readonly id: string;
    readonly weight: number;
    readonly byteOffset: number; // where this line's JSON begins in the outcomes file
    readonly byteLength: number; // exact byte length of the line's JSON (excludes the trailing "\n")
};

// A small, always-fully-loadable per-mode index — the only file a streaming reader needs to open in order to
// do a single-outcome random-access read or a weighted draw against "outcomes_<modeName>.jsonl" without ever
// reading the rest of that (potentially huge) file. "libraryHash"/"librarySchemaVersion" are duplicated from
// the bundle manifest so a caller that only ever needs one mode (the pre-generated runtime, say) can load and
// self-identify a mode without reading manifest.json at all.
export type OutcomeLibraryBundleModeIndex = {
    readonly schemaVersion: number;
    readonly modeName: string;
    readonly libraryId: string;
    readonly librarySchemaVersion: number;
    readonly libraryHash: string;
    readonly outcomeCount: number;
    readonly totalWeight: number;
    readonly outcomesFile: string;
    readonly entries: readonly OutcomeLibraryBundleIndexEntry[]; // canonically sorted by id, same order as the outcomes file
};
