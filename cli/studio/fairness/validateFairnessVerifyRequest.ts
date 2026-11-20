export type FairnessVerifyRequestInput = {proof?: unknown; commitment?: unknown; sourceLibraryDir?: unknown};
export type ValidatedFairnessVerifyRequest = {readonly proof: unknown; readonly commitment?: unknown; readonly sourceLibraryDir?: string};

// "proof"/"commitment" pass through as unknown -- FairnessRoundProofVerifier itself validates both
// structurally (and never throws doing so), so nothing here should second-guess their shape. Only
// "sourceLibraryDir", when present, must be a usable path string -- everything else about whether the
// request is complete enough for a full verification is the verifier's own diagnosable outcome (see
// StudioFairnessVerifyView), not a 400 here.
export function validateFairnessVerifyRequest(input: FairnessVerifyRequestInput): ValidatedFairnessVerifyRequest {
    if (typeof input.proof !== "object" || input.proof === null) {
        throw new Error('"proof" must be an object.');
    }
    if (input.sourceLibraryDir !== undefined && (typeof input.sourceLibraryDir !== "string" || input.sourceLibraryDir.trim().length === 0)) {
        throw new Error('"sourceLibraryDir" must be a non-empty string when provided.');
    }
    return {proof: input.proof, commitment: input.commitment, sourceLibraryDir: input.sourceLibraryDir as string | undefined};
}
