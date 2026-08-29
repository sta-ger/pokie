export type OutcomeLibraryGenerateEstimateRequestInput = {mode?: unknown; maxOutcomeSpaceSize?: unknown};
export type ValidatedOutcomeLibraryGenerateEstimateRequest = {readonly mode?: string; readonly maxOutcomeSpaceSize?: bigint};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
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
            maxOutcomeSpaceSize: parsePositiveOutcomeLibraryGenerationDecimal(input.maxOutcomeSpaceSize, "maxOutcomeSpaceSize"),
        };
    }
    return input.mode !== undefined ? {mode: input.mode as string} : {};
}
import {parsePositiveOutcomeLibraryGenerationDecimal} from "pokie";
