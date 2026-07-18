export type ParSheetExportRequestInput = {blueprint?: unknown; path?: unknown; overwrite?: unknown; sourcePath?: unknown};

export type ValidatedParSheetExportRequest = {blueprint: unknown; path: string; overwrite: boolean; sourcePath?: string};

// The one place a POST /api/home/blueprints/par-export body is turned into a trusted request --
// throws a plain, client-safe Error (StudioServer catches this and maps it to 400) for anything
// malformed. `overwrite` defaults to false — see StudioBlueprintService.exportParSheet()'s own doc
// comment for what that gates. `sourcePath` is optional and, when given, is only ever recorded on the
// exported workbook's own "Meta" sheet (see ParSheetExporting.exportToFile()'s own doc comment).
export function validateParSheetExportRequest(input: ParSheetExportRequestInput): ValidatedParSheetExportRequest {
    const {blueprint, path, overwrite, sourcePath} = input;
    if (blueprint === undefined) {
        throw new Error('"blueprint" is required.');
    }
    if (typeof path !== "string" || path.trim().length === 0) {
        throw new Error('"path" is required.');
    }
    if (overwrite !== undefined && typeof overwrite !== "boolean") {
        throw new Error('"overwrite" must be a boolean when given.');
    }
    if (sourcePath !== undefined && typeof sourcePath !== "string") {
        throw new Error('"sourcePath" must be a string when given.');
    }
    return {blueprint, path, overwrite: overwrite === true, sourcePath};
}
