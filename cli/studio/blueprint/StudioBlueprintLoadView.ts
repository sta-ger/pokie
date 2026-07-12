// POST /api/home/blueprints/load's own DTO. "load-error" covers a path that doesn't exist, doesn't
// parse as JSON, doesn't contain a JSON object, or resolves inside POKIE Studio's own internal
// directory (see StudioBlueprintService.load()) — always a safe message, never a stack trace.
// Deliberately doesn't run GameBlueprintValidator itself: loading and validating are two separate
// explicit editor actions (see StudioBlueprintValidationView).
export type StudioBlueprintLoadView = {status: "ok"; path: string; blueprint: unknown} | {status: "load-error"; error: string};
