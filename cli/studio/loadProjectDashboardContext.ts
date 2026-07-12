import {loadPokieGame} from "pokie";
import path from "path";
import type {ProjectDashboardContext} from "./ProjectDashboardContext.js";

// Adapts loadPokieGame's throw-on-failure contract into ProjectDashboardContext's safe, typed
// "loaded"/"error" result — the one place a failure to load `projectRoot` (missing build output, a
// package that doesn't satisfy the PokieGame contract, a corrupt/missing package.json, an entry
// module that throws on import, ...) is turned into a plain-data error message instead of an
// exception that could otherwise leak a stack trace to an HTTP response. Used both for the
// background load StudioServer kicks off when it starts directly into Project mode, and by
// handleOpenProject (so "does this path actually load" is decided in exactly one place).
export async function loadProjectDashboardContext(
    projectRoot: string,
    loadGame: typeof loadPokieGame = loadPokieGame,
): Promise<ProjectDashboardContext> {
    const resolvedRoot = path.resolve(projectRoot);
    try {
        const game = await loadGame(projectRoot);
        return {status: "loaded", projectRoot: resolvedRoot, game: game.getManifest()};
    } catch (error) {
        return {status: "error", projectRoot: resolvedRoot, error: error instanceof Error ? error.message : String(error)};
    }
}
