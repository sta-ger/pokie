// The outcome of reading and (for JSON) parsing one file, without collapsing distinct failure kinds into a
// single "couldn't get it" bucket -- same convention as StakeEngineImportFileResult, kept as its own type here
// (rather than shared) since StakeEngineStandaloneValidator must stay independent of StakeEngineImportValidator's
// own manifest-bearing rules.
export type StakeEngineStandaloneFileResult<T> =
    | {readonly status: "missing"}
    | {readonly status: "unreadable"; readonly error: string}
    | {readonly status: "invalid"; readonly error: string}
    | {readonly status: "ok"; readonly value: T};

// One books JSONL line's own parse outcome -- "invalid" when the line itself isn't valid JSON, as opposed to
// valid JSON with the wrong shape (checked separately once every line here has at least parsed).
export type StakeEngineStandaloneBookLineResult = {readonly status: "invalid"; readonly error: string} | {readonly status: "ok"; readonly value: unknown};

// Everything StakeEngineStandaloneValidator needs for one mode, already read off disk (or not) -- pure data, so
// the validator itself never touches the filesystem. "cost" travels with the mode files themselves (read straight
// off index.json) since there is no manifest to separately cross-check it against.
export type StakeEngineStandaloneModeFiles = {
    readonly modeName: string;
    readonly cost: number;
    readonly csv: StakeEngineStandaloneFileResult<readonly string[]>;
    readonly books: StakeEngineStandaloneFileResult<readonly StakeEngineStandaloneBookLineResult[]>;
};

// Everything read from a candidate Stake Engine outcome directory, before any validation has run -- assembled by
// StakeEngineOutcomeSourceReader (the only place that touches the filesystem for standalone reading), then handed
// to StakeEngineStandaloneValidator (which never does). Deliberately has no "manifest" field at all -- this
// pipeline never looks for a pokie-manifest.json, unlike StakeEngineImportBundle.
export type StakeEngineStandaloneBundle = {
    readonly stakeDir: string;
    readonly index: StakeEngineStandaloneFileResult<unknown>;
    readonly modeFiles: readonly StakeEngineStandaloneModeFiles[];
};
