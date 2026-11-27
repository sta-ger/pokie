export type BlueprintValidationRequestInput = {blueprint?: unknown; requestId?: unknown};

export type ValidatedBlueprintValidationRequest = {blueprint: unknown; requestId?: string};

// The one place a POST /api/home/blueprints/validate body is turned into a trusted request — throws a
// plain, client-safe Error (StudioServer catches this and maps it to 400) only when `blueprint` itself
// is missing from the request; the blueprint's own shape is GameBlueprintValidator's job, not this
// request validator's.
export function validateBlueprintValidationRequest(input: BlueprintValidationRequestInput): ValidatedBlueprintValidationRequest {
    if (input.blueprint === undefined) {
        throw new Error('"blueprint" is required.');
    }
    if (input.requestId !== undefined && (typeof input.requestId !== "string" || input.requestId.trim().length === 0)) {
        throw new Error('"requestId" must be a non-empty string when present.');
    }
    return {blueprint: input.blueprint, ...(input.requestId === undefined ? {} : {requestId: input.requestId})};
}
