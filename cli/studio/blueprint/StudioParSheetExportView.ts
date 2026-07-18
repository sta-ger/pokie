import type {ValidationIssue} from "pokie";

// POST /api/home/blueprints/par-export's own DTO -- see StudioBlueprintService.exportParSheet()'s own
// doc comment. "conflict" (never a write) mirrors StudioBlueprintSaveView's own overwrite-confirmation
// contract exactly -- the editor is expected to show `error` and let the user explicitly resend with
// "overwrite": true. "invalid" is returned (never a write, same as ParSheetExporting.exportToFile()'s
// own "no partial export" guarantee) when the blueprint itself fails validation or has no exportable
// literal reelStrips -- `errors` here are exactly what "pokie par export" itself would report on the
// CLI, including "parsheet-unsupported-reel-source" for a blueprint that uses reelStripGeneration/
// symbolWeights (which a PAR sheet can't represent at all).
export type StudioParSheetExportView =
    | {status: "ok"; path: string; warnings: ValidationIssue[]}
    | {status: "conflict"; path: string; error: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "error"; error: string};
