// Everything StakeEngineImportValidator needs for one mode, already read off disk (or not, if a file was
// missing) — pure data, so the validator itself never touches the filesystem. "csvLines"/"bookLines" are already
// split/parsed at this point (JSON.parse per JSONL line) but not yet shape-checked — that's the validator's job.
export type StakeEngineImportModeFiles = {
    readonly modeName: string;
    readonly csvFileExists: boolean;
    readonly csvLines: readonly string[];
    readonly booksFileExists: boolean;
    readonly bookLines: readonly unknown[];
};

// Everything read from a candidate Stake Engine export directory, before any validation has run — assembled by
// StakeEngineImporter (the only place that touches the filesystem for import), then handed to
// StakeEngineImportValidator (which never does). "rawIndex"/"rawManifest" are `undefined` when the respective
// file is missing or fails to parse as JSON — never thrown here, since "the file wasn't there"/"wasn't valid
// JSON" are themselves diagnostics the validator reports, not exceptions.
export type StakeEngineImportBundle = {
    readonly stakeDir: string;
    readonly indexFileExists: boolean;
    readonly rawIndex: unknown;
    readonly manifestFileExists: boolean;
    readonly rawManifest: unknown;
    readonly modeFiles: readonly StakeEngineImportModeFiles[];
};
