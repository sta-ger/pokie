import {loadPokieGame, type PokieGame} from "pokie";

// The Deployment Configure step's own "current build" contract, mirrored server-side so a deployment
// request can be checked against it even when it never went through the Configure UI at all -- but
// unlike the Configure UI's own client-side inspectProject -> loadBlueprint -> betModes lookup (whose
// whole point is to reflect the *editable* tracked source blueprint while a developer works on it),
// this loads the project's own currently built package (via loadPokieGame -- the exact same executable
// entry module every other server-side "run the current build" concern already loads, e.g.
// StudioSimulationService/StudioOutcomeLibraryGenerateService) and reads its declared bet modes
// straight off it. Editing, moving, or deleting the tracked source after a build changes nothing this
// function returns -- the built package (src/generated/index.js) embeds its own blueprint data
// verbatim, and only rerunning "pokie build" (which regenerates that file) can change it.
//
// `undefined` means the current build's modes simply aren't known -- an ungenerated project, a package
// whose entry module fails to load, or one that never declared betModes at all -- and callers must
// decide for themselves what "unknown" means for them (see StudioDeploymentService.run(), which treats
// it as a rejection: there is nothing real to check a requested mode against, so nothing can be proven
// safe to deploy).
export async function resolveCurrentBuildModeIds(
    projectRoot: string,
    loadGame: (packageRoot: string) => Promise<PokieGame> = loadPokieGame,
): Promise<readonly string[] | undefined> {
    let game: PokieGame;
    try {
        game = await loadGame(projectRoot);
    } catch {
        return undefined;
    }

    const modeIds = (game.getBetModes?.() ?? []).map((mode) => mode.id.trim()).filter((id) => id.length > 0);
    return modeIds.length > 0 ? modeIds : undefined;
}
