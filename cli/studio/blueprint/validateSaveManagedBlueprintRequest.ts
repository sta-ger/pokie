import type {StudioParSheetConversionEvidence} from "./StudioParSheetImportView.js";

export type SaveManagedBlueprintRequestInput = {blueprint?: unknown; sourceWorkbookPath?: unknown; conversionEvidence?: unknown};

export type ValidatedSaveManagedBlueprintRequest = {blueprint: unknown; sourceWorkbookPath?: string; conversionEvidence?: StudioParSheetConversionEvidence};

// The one place a POST /api/home/blueprints/save-managed body is turned into a trusted request — throws
// a plain, client-safe Error (StudioServer catches this and maps it to 400) for anything malformed.
// `sourceWorkbookPath`, when given, is the .xlsx workbook path a PAR sheet Apply carried into this "first
// Save" (see StudioBlueprintService.saveManaged's own doc comment) — optional, since an ordinary "first
// Save" with no PAR import behind it never sends one.
export function validateSaveManagedBlueprintRequest(input: SaveManagedBlueprintRequestInput): ValidatedSaveManagedBlueprintRequest {
    if (input.blueprint === undefined) {
        throw new Error('"blueprint" is required.');
    }
    if (input.sourceWorkbookPath !== undefined && typeof input.sourceWorkbookPath !== "string") {
        throw new Error('"sourceWorkbookPath" must be a string when given.');
    }
    if (input.conversionEvidence !== undefined) {
        const evidence = input.conversionEvidence as Partial<StudioParSheetConversionEvidence>;
        if (typeof evidence !== "object" || evidence === null || !Array.isArray(evidence.facts) || typeof evidence.losslessEligible !== "boolean" || typeof evidence.importedBlueprintHash !== "string" || typeof evidence.provenanceHashMatches !== "boolean") {
            throw new Error('"conversionEvidence" must be a structured PAR import evidence value when given.');
        }
    }
    return {blueprint: input.blueprint, sourceWorkbookPath: input.sourceWorkbookPath, conversionEvidence: input.conversionEvidence as StudioParSheetConversionEvidence | undefined};
}
