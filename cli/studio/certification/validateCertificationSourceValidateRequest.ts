export type CertificationSourceValidateRequestInput = {bundleDir?: unknown};
export type ValidatedCertificationSourceValidateRequest = {readonly bundleDir: string};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

export function validateCertificationSourceValidateRequest(
    input: CertificationSourceValidateRequestInput,
): ValidatedCertificationSourceValidateRequest {
    if (!isNonEmptyString(input.bundleDir)) {
        throw new Error('"bundleDir" must be a non-empty string.');
    }
    return {bundleDir: input.bundleDir};
}
