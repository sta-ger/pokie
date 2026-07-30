// POST /api/home/fs/open-folder's own DTO — same three-outcome shape as
// StudioNativePickerResultView's own "selected"/"unavailable"/"error" split (minus "cancelled", which
// has no equivalent here: opening a folder in the OS file manager has no "the user closed the dialog"
// outcome to distinguish). "unavailable" covers a non-loopback caller (see isLoopbackRequest's own doc
// comment) — the same guard nativePickerService's own endpoints use, since this also runs a real OS
// command on the machine running Studio's server. "error" covers a `path` that doesn't resolve to an
// existing directory; the OS command itself is fire-and-forget (see openInFileManager's own doc
// comment) and never reports back whether a file manager window actually appeared.
export type StudioOpenFolderView = {status: "ok"} | {status: "unavailable"; reason: string} | {status: "error"; message: string};
