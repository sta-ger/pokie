export type OutcomeLibraryGenerateBoundedInput = {sampleSize?: unknown; seed?: unknown};
export type OutcomeLibraryGenerateRequestInput = {
    mode?: unknown;
    stake?: unknown;
    configHash?: unknown;
    libraryId?: unknown;
    maxOutcomeSpaceSize?: unknown;
    sampled?: OutcomeLibraryGenerateBoundedInput;
    bounded?: OutcomeLibraryGenerateBoundedInput;
    outDir?: unknown;
};

export type ValidatedOutcomeLibraryGenerateRequest = {
    readonly mode?: string;
    readonly stake?: number;
    readonly configHash?: string;
    readonly libraryId?: string;
    readonly maxOutcomeSpaceSize?: bigint;
    readonly sampled?: {readonly sampleSize: bigint; readonly seed: string};
    readonly bounded?: {readonly sampleSize: bigint; readonly seed: string};
    readonly outDir?: string;
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function validateSample(input: OutcomeLibraryGenerateBoundedInput | undefined, field: "bounded" | "sampled"): {sampleSize: bigint; seed: string} | undefined {
    if (input === undefined) return undefined;
    if (typeof input !== "object" || input === null) throw new Error(`"${field}" must be an object with "sampleSize" and "seed" when present.`);
    if (!isNonEmptyString(input.seed)) throw new Error(`"${field}.seed" must be a non-empty string.`);
    return {sampleSize: parsePositiveOutcomeLibraryGenerationDecimal(input.sampleSize, `${field}.sampleSize`), seed: input.seed};
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

    const bounded = validateSample(input.bounded, "bounded");
    const sampled = validateSample(input.sampled, "sampled");
    if (bounded !== undefined && sampled !== undefined) throw new Error('"bounded" and "sampled" cannot be combined.');

    return {
        ...(input.mode !== undefined ? {mode: input.mode as string} : {}),
        ...(input.stake !== undefined ? {stake: input.stake as number} : {}),
        ...(input.configHash !== undefined ? {configHash: input.configHash as string} : {}),
        ...(input.libraryId !== undefined ? {libraryId: input.libraryId as string} : {}),
        ...(input.maxOutcomeSpaceSize !== undefined ? {maxOutcomeSpaceSize: parsePositiveOutcomeLibraryGenerationDecimal(input.maxOutcomeSpaceSize, "maxOutcomeSpaceSize")} : {}),
        ...(bounded !== undefined ? {bounded} : {}),
        ...(sampled !== undefined ? {sampled} : {}),
        ...(input.outDir !== undefined ? {outDir: input.outDir as string} : {}),
    };
}
import {parsePositiveOutcomeLibraryGenerationDecimal} from "pokie";
