export type ProjectRegistrationRequestInput = {location?: unknown; name?: unknown};

export type ValidatedProjectRegistrationRequest = {location: string; name?: string};

// Backs POST /api/home/projects/registry/register -- Import Project's own "register" step, always
// origin "external" (see StudioProjectRegistrationService.registerExternal's own doc comment): a
// managed project is only ever registered internally, by Studio itself, never by a client request.
export function validateProjectRegistrationRequest(input: ProjectRegistrationRequestInput): ValidatedProjectRegistrationRequest {
    const {location, name} = input;
    if (typeof location !== "string" || location.trim().length === 0) {
        throw new Error('"location" is required.');
    }
    if (name !== undefined && typeof name !== "string") {
        throw new Error('"name" must be a string.');
    }
    const trimmedName = name?.trim();
    return trimmedName && trimmedName.length > 0 ? {location, name: trimmedName} : {location};
}
