export type OutcomeLibraryGenerateEstimateRequestInput = {mode?: unknown; maxOutcomeSpaceSize?: unknown};
export type ValidatedOutcomeLibraryGenerateEstimateRequest = {readonly mode?: string; readonly maxOutcomeSpaceSize?: bigint};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// A raw reel-stop combination count routinely exceeds Number.MAX_SAFE_INTEGER, so -- same convention as
// "pokie outcomelibrary generate --max-outcome-space-size" (see OutcomeLibraryCommand's own
// parsePositiveBigIntOption) -- this only ever accepts a decimal string, parsed straight to bigint rather
// than round-tripping through a lossy `Number(value)` first.
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

// "mode" is never required -- an unset mode estimates the package's own default exact outcome space,
// the same as omitting "pokie outcomelibrary generate"'s own --mode (the estimate only reads reel-strip
// sizes, which don't vary by bet mode).
export function validateOutcomeLibraryGenerateEstimateRequest(input: OutcomeLibraryGenerateEstimateRequestInput): ValidatedOutcomeLibraryGenerateEstimateRequest {
    if (input.mode !== undefined && !isNonEmptyString(input.mode)) {
        throw new Error('"mode" must be a non-empty string when present.');
    }
    if (input.maxOutcomeSpaceSize !== undefined) {
        return {
            ...(input.mode !== undefined ? {mode: input.mode as string} : {}),
            maxOutcomeSpaceSize: parsePositiveBigIntField(input.maxOutcomeSpaceSize, "maxOutcomeSpaceSize"),
        };
    }
    return input.mode !== undefined ? {mode: input.mode as string} : {};
}
