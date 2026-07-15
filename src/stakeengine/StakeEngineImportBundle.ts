// The outcome of reading and (for JSON) parsing one file, without collapsing distinct failure kinds into a
// single "couldn't get it" bucket: "missing" (no such file), "unreadable" (the file exists but reading it threw
// — permissions, I/O error, ...), "invalid" (the file was read fine but its own content is malformed — bad JSON,
// bad zstd), or "ok" (fully usable). StakeEngineImportValidator reports a distinct, specific diagnostic for each
// case rather than treating them all as equivalent to a missing/empty file.
export type StakeEngineImportFileResult<T> =
    | {readonly status: "missing"}
    | {readonly status: "unreadable"; readonly error: string}
    | {readonly status: "invalid"; readonly error: string}
    | {readonly status: "ok"; readonly value: T};

// One books JSONL line's own parse outcome — "invalid" when the line itself isn't valid JSON (as opposed to
// valid JSON with the wrong shape, which StakeEngineImportValidator checks separately once every line here has
// at least parsed).
export type StakeEngineImportBookLineResult = {readonly status: "invalid"; readonly error: string} | {readonly status: "ok"; readonly value: unknown};

// Everything StakeEngineImportValidator needs for one mode, already read off disk (or not) — pure data, so the
// validator itself never touches the filesystem.
export type StakeEngineImportModeFiles = {
    readonly modeName: string;
    readonly csv: StakeEngineImportFileResult<readonly string[]>;
    readonly books: StakeEngineImportFileResult<readonly StakeEngineImportBookLineResult[]>;
};

// Everything read from a candidate Stake Engine export directory, before any validation has run — assembled by
// StakeEngineImporter (the only place that touches the filesystem for import), then handed to
// StakeEngineImportValidator (which never does).
export type StakeEngineImportBundle = {
    readonly stakeDir: string;
    readonly index: StakeEngineImportFileResult<unknown>;
    readonly manifest: StakeEngineImportFileResult<unknown>;
    readonly modeFiles: readonly StakeEngineImportModeFiles[];
};
