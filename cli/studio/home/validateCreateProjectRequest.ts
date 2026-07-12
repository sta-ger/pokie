export type CreateProjectRequestInput = {
    destinationDir?: unknown;
    name?: unknown;
    gameId?: unknown;
    gameName?: unknown;
    version?: unknown;
};

export type ValidatedCreateProjectRequest = {
    destinationDir: string;
    name: string;
    gameId?: string;
    gameName?: string;
    version?: string;
};

// The one place a POST /api/home/projects/create body is turned into a trusted
// ValidatedCreateProjectRequest — throws a plain, client-safe Error (StudioServer catches this and maps
// it to 400) for anything malformed. `gameId`/`gameName`/`version` are optional overrides on top of what
// GamePackageCreator would otherwise derive from `name` — see GamePackageCreateOverrides.
export function validateCreateProjectRequest(input: CreateProjectRequestInput): ValidatedCreateProjectRequest {
    const {destinationDir, name} = input;
    if (typeof destinationDir !== "string" || destinationDir.trim().length === 0) {
        throw new Error('"destinationDir" is required.');
    }
    if (typeof name !== "string" || name.trim().length === 0) {
        throw new Error('"name" is required.');
    }

    return {
        destinationDir,
        name,
        gameId: requireOptionalNonEmptyString(input.gameId, "gameId"),
        gameName: requireOptionalNonEmptyString(input.gameName, "gameName"),
        version: requireOptionalNonEmptyString(input.version, "version"),
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
