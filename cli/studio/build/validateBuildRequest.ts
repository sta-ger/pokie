import {ADVERTISED_BUILD_TARGETS, type OutputFormat} from "@fromstan/pokie";

export type BuildRequestInput = {
    target?: unknown;
    outDir?: unknown;
    preparedOperationId?: unknown;
    deferExecution?: unknown;
};

export type ValidatedBuildRequest = {
    readonly target: OutputFormat;
    readonly outDir?: string;
    readonly preparedOperationId?: string;
    readonly deferExecution?: boolean;
};

// The same closed vocabulary BuildOutputBuilderRegistry.listTargets() (and BuildCommand's own --target
// option) already enforce -- spelled out here so an unknown "target" is rejected as a 400 before ever
// resolving a project, instead of surfacing as a later, less specific registry error.
const BUILD_TARGET_TYPES: readonly OutputFormat[] = ADVERTISED_BUILD_TARGETS;

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// The one place a POST /api/project/build/build body is turned into a trusted
// ValidatedBuildRequest -- throws a plain, client-safe Error (StudioServer catches this and maps
// it to 400) for a missing/unknown "target" or a non-string "outDir". Does not check that `target` is
// actually buildable from the active project, or that `outDir` is a safe/available destination -- those
// are StudioBuildService's own job (the same capability-diagnostic/conflict concerns
// BuildOutputBuilderRegistry.build() itself already reports, not a second, differently-worded check here).
export function validateBuildRequest(input: BuildRequestInput): ValidatedBuildRequest {
    const {target, outDir, preparedOperationId, deferExecution} = input;

    if (!isNonEmptyString(target) || !BUILD_TARGET_TYPES.includes(target as OutputFormat)) {
        throw new Error(`"target" must be one of: ${BUILD_TARGET_TYPES.join(", ")}.`);
    }
    if (outDir !== undefined && !isNonEmptyString(outDir)) {
        throw new Error('"outDir" must be a non-empty string when given.');
    }
    if (preparedOperationId !== undefined && !isNonEmptyString(preparedOperationId)) {
        throw new Error('"preparedOperationId" must be a non-empty string when given.');
    }

    if (deferExecution !== undefined && typeof deferExecution !== "boolean") {
        throw new Error('"deferExecution" must be a boolean when given.');
    }

    return {
        ...(deferExecution === undefined ? {} : {deferExecution}),
        target: target as OutputFormat,
        outDir: outDir as string | undefined,
        ...(preparedOperationId === undefined ? {} : {preparedOperationId}),
    };
}
