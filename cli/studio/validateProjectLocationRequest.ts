export type ProjectLocationRequestInput = {location?: unknown};

export type ValidatedProjectLocationRequest = {location: string};

// Shared by the Projects registry's own "preview" (detect) and "remove" requests -- both only ever need
// a bare path, unlike "register" (see validateProjectRegistrationRequest.ts), which also accepts an
// optional display name.
export function validateProjectLocationRequest(input: ProjectLocationRequestInput): ValidatedProjectLocationRequest {
    const {location} = input;
    if (typeof location !== "string" || location.trim().length === 0) {
        throw new Error('"location" is required.');
    }
    return {location};
}
