import type {ParSheetProvenance, ValidationIssue} from "pokie";

// POST /api/home/blueprints/par-import's own DTO -- see StudioBlueprintService.importParSheet()'s own
// doc comment. "load-error" covers a path that doesn't exist, can't be read as an .xlsx workbook, or
// resolves inside POKIE Studio's own internal directory -- always a safe message, never a stack trace.
//
// Unlike StudioBlueprintLoadView, a well-formed workbook always reaches "ok" even when its own mapping/
// validation diagnostics include errors: "ok" here means "the file was read and mapped", not "the
// result is error-free" -- errors/warnings are exactly ParSheetImportResult.issues split by severity
// (same convention as StudioBlueprintService.validate()) for the PAR Sheet Import/Export panel's own
// Diagnose & map step to show, never re-derived or re-validated. `provenance` is the "Meta" sheet's own
// recorded origin (see ParSheetProvenance) -- undefined only when the workbook has no "Meta" sheet at
// all, in which case a "parsheet-provenance-missing" warning is already among `warnings`.
export type StudioParSheetImportView =
    | {
          status: "ok";
          path: string;
          blueprint: unknown;
          provenance?: ParSheetProvenance;
          errors: ValidationIssue[];
          warnings: ValidationIssue[];
      }
    | {status: "load-error"; error: string};
