export type OpenFolderRequestInput = {path?: unknown};

export type ValidatedOpenFolderRequest = {path: string};

export function validateOpenFolderRequest(input: OpenFolderRequestInput): ValidatedOpenFolderRequest {
    const {path: folderPath} = input;
    if (typeof folderPath !== "string" || folderPath.trim().length === 0) {
        throw new Error('"path" is required.');
    }
    return {path: folderPath};
}
