import {GamePackageInspector, loadGameBlueprint, type GameBlueprint, type GamePackageInspecting} from "pokie";

// The Deployment Configure step's own "current build" contract (see DeploymentTab/CertificationTab's
// identical client-side inspectProject -> loadBlueprint -> betModes lookup), mirrored server-side so a
// deployment request can be checked against it even when it never went through the Configure UI at all.
// Reads the active project's own build-info.json (via GamePackageInspector, never trusting anything the
// request itself claims) to find the tracked source blueprint the project was built from, then reads
// that blueprint's own betModes off disk.
//
// `undefined` means the current build's modes simply aren't known -- an ungenerated project, one built
// from an untracked source, or a blueprint that's since moved/been deleted -- and callers must treat that
// the same way the Configure step's own describeBuildModesUnavailable does: there is nothing real to
// check a requested mode against, never a reason to reject the request on this account.
export function resolveCurrentBuildModeIds(
    projectRoot: string,
    gamePackageInspector: GamePackageInspecting = new GamePackageInspector(),
    loadBlueprint: (sourcePath: string) => GameBlueprint = loadGameBlueprint,
): readonly string[] | undefined {
    const report = gamePackageInspector.inspect(projectRoot);
    if (!report.generated || report.buildInfo?.source === undefined) {
        return undefined;
    }

    let blueprint: GameBlueprint;
    try {
        blueprint = loadBlueprint(report.buildInfo.source);
    } catch {
        return undefined;
    }

    const modeIds = (blueprint.betModes ?? []).map((mode) => mode.id.trim()).filter((id) => id.length > 0);
    return modeIds.length > 0 ? modeIds : undefined;
}
