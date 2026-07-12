export type BlueprintBuildRequestInput = {blueprint?: unknown; outDir?: unknown; sourcePath?: unknown};

export type ValidatedBlueprintBuildRequest = {blueprint: unknown; outDir?: string; sourcePath?: string};

// Shared by both POST /api/home/blueprints/build-preview and POST /api/home/blueprints/build — same
// request shape either way (see validateBuildRequest.ts's own analogous path-based pair, and
// StudioBlueprintService.previewBuild()/build()).
export function validateBlueprintBuildRequest(input: BlueprintBuildRequestInput): ValidatedBlueprintBuildRequest {
    const {blueprint, outDir, sourcePath} = input;
    if (blueprint === undefined) {
        throw new Error('"blueprint" is required.');
    }
    return {
        blueprint,
        outDir: requireOptionalNonEmptyString(outDir, "outDir"),
        sourcePath: requireOptionalNonEmptyString(sourcePath, "sourcePath"),
    };
}

function requireOptionalNonEmptyString(value: unknown, field: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error(`"${field}" must be a non-empty string when given.`);
    }
    return value;
}
