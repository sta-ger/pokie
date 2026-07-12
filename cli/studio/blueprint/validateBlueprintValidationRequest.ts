export type BlueprintValidationRequestInput = {blueprint?: unknown};

export type ValidatedBlueprintValidationRequest = {blueprint: unknown};

// The one place a POST /api/home/blueprints/validate body is turned into a trusted request — throws a
// plain, client-safe Error (StudioServer catches this and maps it to 400) only when `blueprint` itself
// is missing from the request; the blueprint's own shape is GameBlueprintValidator's job, not this
// request validator's.
export function validateBlueprintValidationRequest(input: BlueprintValidationRequestInput): ValidatedBlueprintValidationRequest {
    if (input.blueprint === undefined) {
        throw new Error('"blueprint" is required.');
    }
    return {blueprint: input.blueprint};
}
