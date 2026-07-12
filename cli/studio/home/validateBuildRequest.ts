export type BuildRequestInput = {blueprintPath?: unknown; outDir?: unknown};

export type ValidatedBuildRequest = {blueprintPath: string; outDir?: string};

// Shared by both POST /api/home/projects/build/preview and POST /api/home/projects/build — same
// request shape either way (see StudioHomeService.previewBuild()/buildProject()).
export function validateBuildRequest(input: BuildRequestInput): ValidatedBuildRequest {
    const {blueprintPath, outDir} = input;
    if (typeof blueprintPath !== "string" || blueprintPath.trim().length === 0) {
        throw new Error('"blueprintPath" is required.');
    }

    if (outDir === undefined) {
        return {blueprintPath};
    }
    if (typeof outDir !== "string" || outDir.trim().length === 0) {
        throw new Error('"outDir" must be a non-empty string when given.');
    }
    return {blueprintPath, outDir};
}
