import {type OutcomeLibraryGenerationMode, type OutcomeLibraryGenerationSample, parsePositiveOutcomeLibraryGenerationDecimal} from "pokie";
import {validateOutcomeLibraryGenerationSample, type OutcomeLibraryGenerateBoundedInput} from "./validateOutcomeLibraryGenerateRequest.js";

export type OutcomeLibraryGenerateEstimateRequestInput = {
    mode?: unknown;
    maxOutcomeSpaceSize?: unknown;
    generation?: unknown;
    sample?: OutcomeLibraryGenerateBoundedInput;
    sampled?: OutcomeLibraryGenerateBoundedInput;
    bounded?: OutcomeLibraryGenerateBoundedInput;
};
export type ValidatedOutcomeLibraryGenerateEstimateRequest = {
    readonly mode?: string;
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
    const sample = validateOutcomeLibraryGenerationSample(input.sample, "sample");
    const sampled = validateOutcomeLibraryGenerationSample(input.sampled, "sampled");
    const bounded = validateOutcomeLibraryGenerationSample(input.bounded, "bounded");
    if ([sample, sampled, bounded].filter((entry) => entry !== undefined).length > 1) throw new Error('"sample", "sampled", and "bounded" cannot be combined.');
    let legacyGeneration: OutcomeLibraryGenerationMode | undefined;
    if (sampled !== undefined) legacyGeneration = "sampled";
    else if (bounded !== undefined) legacyGeneration = "bounded";
    if (input.generation !== undefined && input.generation !== "default" && input.generation !== "exact" && input.generation !== "sampled" && input.generation !== "bounded") {
        throw new Error('"generation" must be "default", "exact", "sampled", or "bounded" when present.');
    }
    const generation = (input.generation ?? legacyGeneration ?? "default") as OutcomeLibraryGenerationMode;
    if (legacyGeneration !== undefined && input.generation !== undefined && input.generation !== legacyGeneration) throw new Error('"generation" cannot conflict with legacy sampled input.');
    const canonicalSample = sample ?? sampled ?? bounded;
    if ((generation === "sampled" || generation === "bounded") && canonicalSample === undefined) throw new Error(`"generation" ${generation} requires a "sample" with "sampleSize" and "seed".`);
    if ((generation === "default" || generation === "exact") && canonicalSample !== undefined) throw new Error(`"generation" ${generation} cannot be combined with sampled coverage.`);
    return {
        ...(input.mode !== undefined ? {mode: input.mode as string} : {}),
        ...(input.maxOutcomeSpaceSize !== undefined ? {maxOutcomeSpaceSize: parsePositiveOutcomeLibraryGenerationDecimal(input.maxOutcomeSpaceSize, "maxOutcomeSpaceSize")} : {}),
        generation,
        ...(canonicalSample === undefined ? {} : {sample: canonicalSample}),
    };
}
