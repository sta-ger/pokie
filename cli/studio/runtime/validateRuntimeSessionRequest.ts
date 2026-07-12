export type RuntimeSessionRequestInput = {seed?: unknown};

export type ValidatedRuntimeSessionRequest = {seed?: string | number};

// The one place a POST /api/project/runtime/sessions body is turned into a trusted request — throws a
// plain, client-safe Error (StudioServer catches this and maps it to 400) for anything malformed.
export function validateRuntimeSessionRequest(input: RuntimeSessionRequestInput): ValidatedRuntimeSessionRequest {
    const {seed} = input;
    if (seed !== undefined && typeof seed !== "string" && typeof seed !== "number") {
        throw new Error('"seed" must be a string or number when given.');
    }
    return {seed: seed as string | number | undefined};
}
