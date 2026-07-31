export type OutcomeLibraryGenerateBoundedInput = {sampleSize?: unknown; seed?: unknown};
export type OutcomeLibraryGenerateRequestInput = {
    mode?: unknown;
    stake?: unknown;
    configHash?: unknown;
    libraryId?: unknown;
    maxOutcomeSpaceSize?: unknown;
    bounded?: OutcomeLibraryGenerateBoundedInput;
    outDir?: unknown;
};

export type ValidatedOutcomeLibraryGenerateRequest = {
    readonly mode?: string;
    readonly stake?: number;
    readonly configHash?: string;
    readonly libraryId?: string;
    readonly maxOutcomeSpaceSize?: bigint;
    readonly bounded?: {readonly sampleSize: bigint; readonly seed: string};
    readonly outDir?: string;
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// Same bigint-safe decimal-string convention as validateOutcomeLibraryGenerateEstimateRequest's own
// parsePositiveBigIntField -- kept as a private, separately-named copy (not imported from that sibling
// file) since neither validator has any other reason to depend on the other.
function parsePositiveBigIntField(value: unknown, field: string): bigint {
    if (typeof value !== "string" || !(/^[0-9]+$/).test(value)) {
        throw new Error(`"${field}" must be a positive integer decimal string.`);
    }
    const parsed = BigInt(value);
    if (parsed <= BigInt(0)) {
        throw new Error(`"${field}" must be a positive integer decimal string.`);
    }
    return parsed;
}

// The Studio Generate step's own request shape -- deliberately mirrors "pokie outcomelibrary generate"'s
// own flags (see OutcomeLibraryCommand's GenerateCliOptions) rather than inventing a parallel vocabulary,
// since both ultimately call the exact same generateExactWeightedOutcomeLibrary. Unlike the CLI, there is
// no --dry-run/--resume/--progress here -- --estimate has its own endpoint (see
// validateOutcomeLibraryGenerateEstimateRequest), and Studio's Generate step is a single synchronous
// request/response, not a resumable/cancellable job (see StudioOutcomeLibraryGenerateService's own doc
// comment for that scope decision).
export function validateOutcomeLibraryGenerateRequest(input: OutcomeLibraryGenerateRequestInput): ValidatedOutcomeLibraryGenerateRequest {
    if (input.mode !== undefined && !isNonEmptyString(input.mode)) {
        throw new Error('"mode" must be a non-empty string when present.');
    }
    if (input.stake !== undefined && (typeof input.stake !== "number" || !Number.isFinite(input.stake) || input.stake <= 0)) {
        throw new Error('"stake" must be a positive number when present.');
    }
    if (input.configHash !== undefined && !isNonEmptyString(input.configHash)) {
        throw new Error('"configHash" must be a non-empty string when present.');
    }
    if (input.libraryId !== undefined && !isNonEmptyString(input.libraryId)) {
        throw new Error('"libraryId" must be a non-empty string when present.');
    }
    if (input.outDir !== undefined && !isNonEmptyString(input.outDir)) {
        throw new Error('"outDir" must be a non-empty string when present.');
    }

    let bounded: {sampleSize: bigint; seed: string} | undefined;
    if (input.bounded !== undefined) {
        if (typeof input.bounded !== "object" || input.bounded === null) {
            throw new Error('"bounded" must be an object with "sampleSize" and "seed" when present.');
        }
        if (!isNonEmptyString(input.bounded.seed)) {
            throw new Error('"bounded.seed" must be a non-empty string.');
        }
        bounded = {sampleSize: parsePositiveBigIntField(input.bounded.sampleSize, "bounded.sampleSize"), seed: input.bounded.seed};
    }

    return {
        ...(input.mode !== undefined ? {mode: input.mode as string} : {}),
        ...(input.stake !== undefined ? {stake: input.stake as number} : {}),
        ...(input.configHash !== undefined ? {configHash: input.configHash as string} : {}),
        ...(input.libraryId !== undefined ? {libraryId: input.libraryId as string} : {}),
        ...(input.maxOutcomeSpaceSize !== undefined ? {maxOutcomeSpaceSize: parsePositiveBigIntField(input.maxOutcomeSpaceSize, "maxOutcomeSpaceSize")} : {}),
        ...(bounded !== undefined ? {bounded} : {}),
        ...(input.outDir !== undefined ? {outDir: input.outDir as string} : {}),
    };
}
