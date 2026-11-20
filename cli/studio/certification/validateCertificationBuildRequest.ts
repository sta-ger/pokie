import {validateCertificationPackInputs, validateCertificationPackOutput, type CertificationPackInputs, type CertificationPackOutput} from "@fromstan/pokie";
export type CertificationBuildRequestInput = {libraryDir?: unknown; outDir?: unknown; modes?: unknown; pack?: unknown; output?: unknown};
export type ValidatedCertificationBuildModeInput = {readonly modeName: string; readonly seed: string; readonly sampleCount: number};
export type ValidatedCertificationBuildRequest = {
    readonly pack?: CertificationPackInputs;
    readonly output?: CertificationPackOutput;
    readonly libraryDir: string;
    readonly outDir: string;
    readonly modes: readonly ValidatedCertificationBuildModeInput[];
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// Shape/type checks only -- never the domain-level mode-name/seed/sampleCount validation
// CertificationPackBuilder itself already performs (and reports as ValidationIssues); this
// only guards against a request too malformed to even attempt.
export function validateCertificationBuildRequest(input: CertificationBuildRequestInput): ValidatedCertificationBuildRequest {
    if (!isNonEmptyString(input.libraryDir)) {
        throw new Error('"libraryDir" must be a non-empty string.');
    }
    if (!isNonEmptyString(input.outDir)) {
        throw new Error('"outDir" must be a non-empty string.');
    }
    if (!Array.isArray(input.modes) || input.modes.length === 0) {
        throw new Error('"modes" must be a non-empty array.');
    }

    const modes = input.modes.map((entry, position) => {
        if (
            typeof entry !== "object" ||
            entry === null ||
            !isNonEmptyString((entry as {modeName?: unknown}).modeName) ||
            !isNonEmptyString((entry as {seed?: unknown}).seed) ||
            typeof (entry as {sampleCount?: unknown}).sampleCount !== "number"
        ) {
            throw new Error(`"modes[${position}]" must be an object with a non-empty string "modeName"/"seed" and a number "sampleCount".`);
        }
        const e = entry as {modeName: string; seed: string; sampleCount: number};
        return {modeName: e.modeName, seed: e.seed, sampleCount: e.sampleCount};
    });

    if (input.pack !== undefined) validateCertificationPackInputs(input.pack);
    if (input.output !== undefined) validateCertificationPackOutput(input.output);
    return {libraryDir: input.libraryDir, outDir: input.outDir, modes, ...(input.pack ? {pack: input.pack as CertificationPackInputs} : {}), ...(input.output ? {output: input.output as CertificationPackOutput} : {})};
}
