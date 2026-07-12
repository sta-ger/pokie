export type InitProjectRequestInput = {directory?: unknown};

export type ValidatedInitProjectRequest = {directory: string};

export function validateInitProjectRequest(input: InitProjectRequestInput): ValidatedInitProjectRequest {
    const {directory} = input;
    if (typeof directory !== "string" || directory.trim().length === 0) {
        throw new Error('"directory" is required.');
    }
    return {directory};
}
