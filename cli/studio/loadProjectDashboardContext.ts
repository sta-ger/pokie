import {loadPokieGame} from "pokie";
import path from "path";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import type {ProjectDashboardContext} from "./ProjectDashboardContext.js";

// Adapts loadPokieGame's throw-on-failure contract into ProjectDashboardContext's safe, typed
// "loaded"/"error" result — the one place a failure to load `projectRoot` (missing build output, a
// package that doesn't satisfy the PokieGame contract, a corrupt/missing package.json, an entry
// module that throws on import, ...) is turned into a plain-data error message instead of an
// exception that could otherwise leak a stack trace to an HTTP response. Used both for the
// background load StudioServer kicks off when it starts directly into Project mode, and by
// handleOpenProject (so "does this path actually load" is decided in exactly one place).
//
// `resolveRuntimePackageRoot` crosses the same materializing boundary sim/dev/serve/replay/Play cross
// (see materializeRuntimePackage.ts) before loadGame ever runs — a resolved "blueprint" `projectRoot`
// (e.g. a bare `pokie <blueprint.json>` launch) is materialized into a real runtime first, and an
// unsupported project type (outcomeLibrary/stakeAdapter/parWorkbook/wasm) surfaces its
// UnsupportedProjectOperationError's own message as this result's "error", never a raw loadPokieGame
// failure a user would have to guess the cause of. Defaults to a no-op passthrough so every existing
// caller/test keeps behaving exactly as before this boundary existed.
export async function loadProjectDashboardContext(
    projectRoot: string,
    loadGame: typeof loadPokieGame = loadPokieGame,
    resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
): Promise<ProjectDashboardContext> {
    const resolvedRoot = path.resolve(projectRoot);
    try {
        const resolution = await resolveRuntimePackageRoot(projectRoot);
        try {
            const game = await loadGame(resolution.runtimePath);
            return {status: "loaded", projectRoot: resolvedRoot, game: game.getManifest()};
        } finally {
            await resolution.release();
        }
    } catch (error) {
        return {status: "error", projectRoot: resolvedRoot, error: error instanceof Error ? error.message : String(error)};
    }
}
