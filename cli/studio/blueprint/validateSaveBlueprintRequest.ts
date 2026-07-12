export type SaveBlueprintRequestInput = {path?: unknown; blueprint?: unknown; overwrite?: unknown};

export type ValidatedSaveBlueprintRequest = {path: string; blueprint: unknown; overwrite: boolean};

// The one place a POST /api/home/blueprints/save body is turned into a trusted request — throws a
// plain, client-safe Error (StudioServer catches this and maps it to 400) for anything malformed.
// `overwrite` defaults to false — see StudioBlueprintService.save()'s own doc comment for what that
// gates.
export function validateSaveBlueprintRequest(input: SaveBlueprintRequestInput): ValidatedSaveBlueprintRequest {
    const {path, blueprint, overwrite} = input;
    if (typeof path !== "string" || path.trim().length === 0) {
        throw new Error('"path" is required.');
    }
    if (blueprint === undefined) {
        throw new Error('"blueprint" is required.');
    }
    if (overwrite !== undefined && typeof overwrite !== "boolean") {
        throw new Error('"overwrite" must be a boolean when given.');
    }
    return {path, blueprint, overwrite: overwrite === true};
}
