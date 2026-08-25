import {ADVERTISED_ARTIFACT_BUILD_TARGETS, type ArtifactTargetType} from "pokie";

export type ArtifactBuildRequestInput = {
    target?: unknown;
    outDir?: unknown;
};

export type ValidatedArtifactBuildRequest = {
    readonly target: ArtifactTargetType;
    readonly outDir?: string;
};

// The same closed vocabulary ArtifactBuilderRegistry.listTargets() (and BuildCommand's own --target
// option) already enforce -- spelled out here so an unknown "target" is rejected as a 400 before ever
// resolving a project, instead of surfacing as a later, less specific registry error.
const ARTIFACT_TARGET_TYPES: readonly ArtifactTargetType[] = ADVERTISED_ARTIFACT_BUILD_TARGETS;

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// The one place a POST /api/project/artifacts/build body is turned into a trusted
// ValidatedArtifactBuildRequest -- throws a plain, client-safe Error (StudioServer catches this and maps
// it to 400) for a missing/unknown "target" or a non-string "outDir". Does not check that `target` is
// actually buildable from the active project, or that `outDir` is a safe/available destination -- those
// are StudioArtifactBuildService's own job (the same capability-diagnostic/conflict concerns
// ArtifactBuilderRegistry.build() itself already reports, not a second, differently-worded check here).
export function validateArtifactBuildRequest(input: ArtifactBuildRequestInput): ValidatedArtifactBuildRequest {
    const {target, outDir} = input;

    if (!isNonEmptyString(target) || !ARTIFACT_TARGET_TYPES.includes(target as ArtifactTargetType)) {
        throw new Error(`"target" must be one of: ${ARTIFACT_TARGET_TYPES.join(", ")}.`);
    }
    if (outDir !== undefined && !isNonEmptyString(outDir)) {
        throw new Error('"outDir" must be a non-empty string when given.');
    }

    return {target: target as ArtifactTargetType, outDir: outDir as string | undefined};
}
