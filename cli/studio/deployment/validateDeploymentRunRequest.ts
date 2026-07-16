import type {StudioDeploymentModeInput} from "./StudioDeploymentModeInput.js";

export type DeploymentRunRequestInput = {
    targetId?: unknown;
    modes?: unknown;
    publish?: unknown;
};

export type ValidatedDeploymentRunRequest = {
    readonly targetId: string;
    readonly modes: readonly StudioDeploymentModeInput[];
    readonly publish: boolean;
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// The one place a POST /api/project/deployment/runs body is turned into a trusted
// ValidatedDeploymentRunRequest — throws a plain, client-safe Error (StudioServer catches this and
// maps it to 400) for anything malformed: a missing/empty targetId, an empty modes array, a mode
// entry with a missing/empty modeName or libraryPath, or a non-boolean publish. Does not check that
// targetId refers to a real target, or that libraryPath actually resolves to a real, readable,
// well-formed library — those are StudioDeploymentService's own job (404 / structured run-result
// concerns, not "is this request even shaped right").
export function validateDeploymentRunRequest(input: DeploymentRunRequestInput): ValidatedDeploymentRunRequest {
    const {targetId, modes, publish} = input;

    if (!isNonEmptyString(targetId)) {
        throw new Error('"targetId" must be a non-empty string.');
    }
    if (!Array.isArray(modes) || modes.length === 0) {
        throw new Error('"modes" must be a non-empty array.');
    }
    if (publish !== undefined && typeof publish !== "boolean") {
        throw new Error('"publish" must be a boolean when given.');
    }

    const validatedModes: StudioDeploymentModeInput[] = modes.map((rawMode: unknown, index: number) => {
        const mode = (rawMode ?? {}) as {modeName?: unknown; libraryPath?: unknown};
        if (!isNonEmptyString(mode.modeName)) {
            throw new Error(`modes[${index}].modeName must be a non-empty string.`);
        }
        if (!isNonEmptyString(mode.libraryPath)) {
            throw new Error(`modes[${index}].libraryPath must be a non-empty string.`);
        }
        return {modeName: mode.modeName, libraryPath: mode.libraryPath};
    });

    return {targetId, modes: validatedModes, publish: publish ?? false};
}
