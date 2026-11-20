export type FairnessGenerateRequestInput = {libraryDir?: unknown; commitment?: unknown; serverSeed?: unknown};
export type ValidatedFairnessGenerateRequest = {readonly libraryDir: string; readonly commitment: unknown; readonly serverSeed: string};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// "commitment" passes through as unknown -- its structural validation is FairnessCommitmentValidator's
// job, run unconditionally inside FairnessRoundProofBuilder.build itself; duplicating that check here
// would just be a second, potentially drifting copy of the same rules.
export function validateFairnessGenerateRequest(input: FairnessGenerateRequestInput): ValidatedFairnessGenerateRequest {
    if (!isNonEmptyString(input.libraryDir)) {
        throw new Error('"libraryDir" must be a non-empty string.');
    }
    if (typeof input.commitment !== "object" || input.commitment === null) {
        throw new Error('"commitment" must be an object.');
    }
    if (!isNonEmptyString(input.serverSeed)) {
        throw new Error('"serverSeed" must be a non-empty string.');
    }
    return {libraryDir: input.libraryDir, commitment: input.commitment, serverSeed: input.serverSeed};
}
