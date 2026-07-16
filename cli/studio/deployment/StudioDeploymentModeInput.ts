// One mode entry of a POST /api/project/deployment/runs request body — "libraryPath" is a path
// relative to the active project's own root, resolved and read server-side (see
// loadWeightedOutcomeLibraryFromProjectFile) rather than the client ever sending a whole
// WeightedOutcomeLibrary inline: Studio operates on a project directory the same way every other
// Project Dashboard feature does (Inspect/Validate/Simulate/Replay all take a path, never a blob).
export type StudioDeploymentModeInput = {
    readonly modeName: string;
    readonly libraryPath: string;
};
