export type ParSheetImportRequestInput = {path?: unknown};

export type ValidatedParSheetImportRequest = {path: string};

// The one place a POST /api/home/blueprints/par-import body is turned into a trusted request --
// throws a plain, client-safe Error (StudioServer catches this and maps it to 400) for anything
// malformed.
export function validateParSheetImportRequest(input: ParSheetImportRequestInput): ValidatedParSheetImportRequest {
    const {path} = input;
    if (typeof path !== "string" || path.trim().length === 0) {
        throw new Error('"path" is required.');
    }
    return {path};
}
