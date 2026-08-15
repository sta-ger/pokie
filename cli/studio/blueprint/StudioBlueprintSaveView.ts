// POST /api/home/blueprints/save's own DTO. In addition to the ordinary "existing" conflict for a
// new Save target, a caller that provides the `expectedHash` captured by load() gets an optimistic
// concurrency check. A "stale" conflict is never written, even with `overwrite: true`, and carries both
// the current persisted Blueprint and the attempted edit so the client can offer Reload, Compare and
// Save As without another fetch. "error" covers an fs failure (e.g. an unwritable directory) or a path
// resolving inside POKIE Studio's own internal directory — always a safe message, never a stack trace.
//
// "blueprintHash" on "ok" is the just-written content's own exact-content hash (see
// computeGameBlueprintHash) — a caller tracking whether this same path's persisted source later changes
// externally (see StudioBlueprintCheckView) uses it as its own next "known-good" snapshot, the same way
// it would use StudioBlueprintLoadView.blueprintHash after a Load.
export type StudioBlueprintSaveView =
    | {status: "ok"; path: string; blueprintHash: string}
    | {
          status: "conflict";
          reason: "existing" | "stale";
          path: string;
          error: string;
          currentBlueprint?: unknown;
          currentHash?: string;
          editedBlueprint: unknown;
          editedHash: string;
          expectedHash?: string;
          canSaveAs: true;
      }
    | {status: "error"; error: string};
