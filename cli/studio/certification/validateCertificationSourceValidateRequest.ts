export type CertificationSourceValidateRequestInput = {libraryDir?: unknown};
export type ValidatedCertificationSourceValidateRequest = {readonly libraryDir: string};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

export function validateCertificationSourceValidateRequest(
    input: CertificationSourceValidateRequestInput,
): ValidatedCertificationSourceValidateRequest {
    if (!isNonEmptyString(input.libraryDir)) {
        throw new Error('"libraryDir" must be a non-empty string.');
    }
    return {libraryDir: input.libraryDir};
}
