export type OutcomeLibraryDeepValidateRequestInput = {bundleDir?: unknown; modeName?: unknown};
export type ValidatedOutcomeLibraryDeepValidateRequest = {readonly bundleDir: string; readonly modeName: string};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// Deep validation is bundle-only (see StudioOutcomeLibraryDeepValidateView) -- no "kind" discriminator
// needed, the request is always a bundle directory + mode name.
export function validateOutcomeLibraryDeepValidateRequest(input: OutcomeLibraryDeepValidateRequestInput): ValidatedOutcomeLibraryDeepValidateRequest {
    if (!isNonEmptyString(input.bundleDir)) {
        throw new Error('"bundleDir" must be a non-empty string.');
    }
    if (!isNonEmptyString(input.modeName)) {
        throw new Error('"modeName" must be a non-empty string.');
    }
    return {bundleDir: input.bundleDir, modeName: input.modeName};
}
