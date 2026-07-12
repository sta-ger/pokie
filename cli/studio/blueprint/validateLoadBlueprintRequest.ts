export type LoadBlueprintRequestInput = {path?: unknown};

export type ValidatedLoadBlueprintRequest = {path: string};

// The one place a POST /api/home/blueprints/load body is turned into a trusted request — throws a
// plain, client-safe Error (StudioServer catches this and maps it to 400) for anything malformed.
export function validateLoadBlueprintRequest(input: LoadBlueprintRequestInput): ValidatedLoadBlueprintRequest {
    const {path} = input;
    if (typeof path !== "string" || path.trim().length === 0) {
        throw new Error('"path" is required.');
    }
    return {path};
}
