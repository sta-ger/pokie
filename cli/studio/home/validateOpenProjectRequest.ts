export type OpenProjectRequestInput = {projectRoot?: unknown};

export type ValidatedOpenProjectRequest = {projectRoot: string};

export function validateOpenProjectRequest(input: OpenProjectRequestInput): ValidatedOpenProjectRequest {
    const {projectRoot} = input;
    if (typeof projectRoot !== "string" || projectRoot.trim().length === 0) {
        throw new Error('"projectRoot" is required.');
    }
    return {projectRoot};
}
