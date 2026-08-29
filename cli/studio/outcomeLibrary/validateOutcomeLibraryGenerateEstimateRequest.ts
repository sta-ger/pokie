import {type OutcomeLibraryGenerationMode, type OutcomeLibraryGenerationSample, parsePositiveOutcomeLibraryGenerationDecimal} from "pokie";
import {adaptOutcomeLibraryGenerationTransport, type OutcomeLibraryGenerateBoundedInput} from "./validateOutcomeLibraryGenerateRequest.js";

export type OutcomeLibraryGenerateEstimateRequestInput = {
    mode?: unknown;
    stake?: unknown;
    configHash?: unknown;
    libraryId?: unknown;
    outDir?: unknown;
    maxOutcomeSpaceSize?: unknown;
    generation?: unknown;
    sample?: OutcomeLibraryGenerateBoundedInput;
    sampled?: OutcomeLibraryGenerateBoundedInput;
    bounded?: OutcomeLibraryGenerateBoundedInput;
};
export type ValidatedOutcomeLibraryGenerateEstimateRequest = {
    readonly mode?: string;
    readonly stake?: number;
    readonly configHash?: string;
    readonly libraryId?: string;
    readonly outDir?: string;
    readonly maxOutcomeSpaceSize?: bigint;
    readonly generation?: OutcomeLibraryGenerationMode;
    readonly sample?: OutcomeLibraryGenerationSample;
};

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
    if (input.stake !== undefined && (typeof input.stake !== "number" || !Number.isFinite(input.stake) || input.stake <= 0)) throw new Error('"stake" must be a positive number when present.');
    if (input.configHash !== undefined && !isNonEmptyString(input.configHash)) throw new Error('"configHash" must be a non-empty string when present.');
    if (input.libraryId !== undefined && !isNonEmptyString(input.libraryId)) throw new Error('"libraryId" must be a non-empty string when present.');
    if (input.outDir !== undefined && !isNonEmptyString(input.outDir)) throw new Error('"outDir" must be a non-empty string when present.');
    const {generation, sample: canonicalSample} = adaptOutcomeLibraryGenerationTransport(input);
    return {
        ...(input.mode !== undefined ? {mode: input.mode as string} : {}),
        ...(input.stake !== undefined ? {stake: input.stake as number} : {}),
        ...(input.configHash !== undefined ? {configHash: input.configHash as string} : {}),
        ...(input.libraryId !== undefined ? {libraryId: input.libraryId as string} : {}),
        ...(input.outDir !== undefined ? {outDir: input.outDir as string} : {}),
        ...(input.maxOutcomeSpaceSize !== undefined ? {maxOutcomeSpaceSize: parsePositiveOutcomeLibraryGenerationDecimal(input.maxOutcomeSpaceSize, "maxOutcomeSpaceSize")} : {}),
        generation,
        ...(canonicalSample === undefined ? {} : {sample: canonicalSample}),
    };
}
