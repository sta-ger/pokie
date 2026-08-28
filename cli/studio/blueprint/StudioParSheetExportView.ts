import type {ValidationIssue} from "pokie";

// POST /api/home/blueprints/par-export's own DTO -- see StudioBlueprintService.exportParSheet()'s own
// doc comment. "conflict" is never a write: exports share artifact publication's no-overwrite policy,
// even when a legacy request includes "overwrite": true. "invalid" is returned (never a write, same as ParSheetExporting.exportToFile()'s
// own "no partial export" guarantee) when the blueprint itself fails validation or a generated reel cannot
// be materialized. Valid generated, weighted, and default reel sources are exported as literal snapshots.
export type StudioParSheetExportView =
    | {status: "ok"; path: string; warnings: ValidationIssue[]}
    | {status: "conflict"; path: string; error: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "error"; error: string};
