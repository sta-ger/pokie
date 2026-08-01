// GET /api/project/deployment/build-modes' own DTO -- the Configure step's own mode picker's data,
// resolved from the project's own current built package (see resolveCurrentBuildModeIds's own doc
// comment), never the mutable tracked source blueprint that inspectProject/loadBlueprint expose.
// "unavailable" covers both "no current build to inspect" and "current build declares no modes" --
// either way there is nothing real for Configure to pick a mode from.
export type StudioDeploymentBuildModesView = {readonly status: "ok"; readonly modeIds: readonly string[]} | {readonly status: "unavailable"};
