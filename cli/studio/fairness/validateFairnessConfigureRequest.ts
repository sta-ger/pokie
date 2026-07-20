export type FairnessConfigureRequestInput = {
    bundleDir?: unknown;
    modeName?: unknown;
    serverSeed?: unknown;
    clientSeed?: unknown;
    nonce?: unknown;
};
export type ValidatedFairnessConfigureRequest = {
    readonly bundleDir: string;
    readonly modeName: string;
    readonly serverSeed: string;
    readonly clientSeed: string;
    readonly nonce: number;
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// Shape/type checks only -- the actual seed/modeName/nonce validity rules live in
// computeFairnessServerSeedCommitment/computeFairnessCommitment (see FairnessCommitmentValidator), never
// duplicated here.
export function validateFairnessConfigureRequest(input: FairnessConfigureRequestInput): ValidatedFairnessConfigureRequest {
    if (!isNonEmptyString(input.bundleDir)) {
        throw new Error('"bundleDir" must be a non-empty string.');
    }
    if (!isNonEmptyString(input.modeName)) {
        throw new Error('"modeName" must be a non-empty string.');
    }
    if (!isNonEmptyString(input.serverSeed)) {
        throw new Error('"serverSeed" must be a non-empty string.');
    }
    if (!isNonEmptyString(input.clientSeed)) {
        throw new Error('"clientSeed" must be a non-empty string.');
    }
    if (typeof input.nonce !== "number") {
        throw new Error('"nonce" must be a number.');
    }
    return {bundleDir: input.bundleDir, modeName: input.modeName, serverSeed: input.serverSeed, clientSeed: input.clientSeed, nonce: input.nonce};
}
