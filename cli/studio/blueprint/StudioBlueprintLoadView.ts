// POST /api/home/blueprints/load's own DTO. "load-error" covers a path that doesn't exist, doesn't
// parse as JSON, doesn't contain a JSON object, or resolves inside POKIE Studio's own internal
// directory (see StudioBlueprintService.load()) — always a safe message, never a stack trace.
// Deliberately doesn't run GameBlueprintValidator itself: loading and validating are two separate
// explicit editor actions (see StudioBlueprintValidationView).
//
// "blueprintHash" is the loaded content's own exact-content hash (see computeGameBlueprintHash) — a
// caller that later wants to commit an edit back to this same path (see StudioBlueprintApplyView) uses
// it as the snapshot/"expectedHash" its request was built from, without needing to keep (or re-hash)
// the full content itself just to detect whether the file changed on disk in between.
export type StudioBlueprintLoadView = {status: "ok"; path: string; blueprint: unknown; blueprintHash: string} | {status: "load-error"; error: string};
