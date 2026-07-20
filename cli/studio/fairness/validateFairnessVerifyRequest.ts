export type FairnessVerifyRequestInput = {proof?: unknown; commitment?: unknown; sourceBundleDir?: unknown};
export type ValidatedFairnessVerifyRequest = {readonly proof: unknown; readonly commitment?: unknown; readonly sourceBundleDir?: string};

// "proof"/"commitment" pass through as unknown -- FairnessRoundProofVerifier itself validates both
// structurally (and never throws doing so), so nothing here should second-guess their shape. Only
// "sourceBundleDir", when present, must be a usable path string -- everything else about whether the
// request is complete enough for a full verification is the verifier's own diagnosable outcome (see
// StudioFairnessVerifyView), not a 400 here.
export function validateFairnessVerifyRequest(input: FairnessVerifyRequestInput): ValidatedFairnessVerifyRequest {
    if (typeof input.proof !== "object" || input.proof === null) {
        throw new Error('"proof" must be an object.');
    }
    if (input.sourceBundleDir !== undefined && (typeof input.sourceBundleDir !== "string" || input.sourceBundleDir.trim().length === 0)) {
        throw new Error('"sourceBundleDir" must be a non-empty string when provided.');
    }
    return {proof: input.proof, commitment: input.commitment, sourceBundleDir: input.sourceBundleDir as string | undefined};
}
