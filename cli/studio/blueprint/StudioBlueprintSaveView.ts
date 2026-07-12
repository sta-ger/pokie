// POST /api/home/blueprints/save's own DTO. "conflict" is returned (never a write) when `path` already
// exists on disk and the request didn't set `overwrite: true` — the editor is expected to show `error`
// to the user and let them explicitly resend with `overwrite: true` to replace it. "error" covers an
// fs failure (e.g. an unwritable directory) or a path resolving inside POKIE Studio's own internal
// directory — always a safe message, never a stack trace.
export type StudioBlueprintSaveView =
    | {status: "ok"; path: string}
    | {status: "conflict"; path: string; error: string}
    | {status: "error"; error: string};
