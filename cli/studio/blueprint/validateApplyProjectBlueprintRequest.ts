export type ApplyProjectBlueprintRequestInput = {blueprint?: unknown; expectedHash?: unknown};
export type ValidatedApplyProjectBlueprintRequest = {blueprint: unknown; expectedHash: string};

// projectRoot/sourcePath are deliberately not request fields at all — see
// StudioBlueprintService.applyToProject()'s own doc comment for why those are always resolved
// server-side from the current project, never taken from client input.
export function validateApplyProjectBlueprintRequest(input: ApplyProjectBlueprintRequestInput): ValidatedApplyProjectBlueprintRequest {
    const {blueprint, expectedHash} = input;
    if (blueprint === undefined) {
        throw new Error('"blueprint" is required.');
    }
    if (typeof expectedHash !== "string" || expectedHash.trim().length === 0) {
        throw new Error('"expectedHash" is required and must be a non-empty string.');
    }
    return {blueprint, expectedHash};
}
