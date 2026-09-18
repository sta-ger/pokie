export type OpenProjectRequestInput = {projectRoot?: unknown; confirmActiveJobs?: unknown};

export type ValidatedOpenProjectRequest = {projectRoot: string; confirmActiveJobs: boolean};

export function validateOpenProjectRequest(input: OpenProjectRequestInput): ValidatedOpenProjectRequest {
    const {projectRoot} = input;
    if (typeof projectRoot !== "string" || projectRoot.trim().length === 0) {
        throw new Error('"projectRoot" is required.');
    }
    if (input.confirmActiveJobs !== undefined && typeof input.confirmActiveJobs !== "boolean") {
        throw new Error('"confirmActiveJobs" must be a boolean when provided.');
    }
    return {projectRoot, confirmActiveJobs: input.confirmActiveJobs === true};
}
