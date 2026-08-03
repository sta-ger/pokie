import {loadPokieGame, type ProjectType} from "pokie";
import path from "path";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import type {ProjectDashboardContext} from "./ProjectDashboardContext.js";
import type {StudioProjectOrigin} from "./StudioProjectRegistryEntry.js";

export type ProjectLocationDescribing = (
    location: string,
) => Promise<{type: ProjectType; capabilities: readonly string[]; origin?: StudioProjectOrigin} | undefined>;

// Defaults to "nothing known" so every existing caller/test keeps behaving exactly as before
// type/capabilities/origin existed on this result.
const noDescribeLocation: ProjectLocationDescribing = () => Promise.resolve(undefined);

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
//
// `describeLocation` (typically StudioProjectRegistrationService.describeLocation) separately answers
// "what is `projectRoot` itself" -- type/capabilities/origin, for Overview -- and is deliberately never
// allowed to fail this load: it runs after `game` already loaded successfully, and any error from it is
// swallowed, leaving those fields undefined rather than turning an otherwise-successful load into
// "error".
export async function loadProjectDashboardContext(
    projectRoot: string,
    loadGame: typeof loadPokieGame = loadPokieGame,
    resolveRuntimePackageRoot: RuntimePackageResolving = passthroughRuntimePackageResolver,
    describeLocation: ProjectLocationDescribing = noDescribeLocation,
): Promise<ProjectDashboardContext> {
    const resolvedRoot = path.resolve(projectRoot);
    try {
        const resolution = await resolveRuntimePackageRoot(projectRoot);
        try {
            const game = await loadGame(resolution.runtimePath);
            const identity = await describeLocation(projectRoot).catch(() => undefined);
            return {
                status: "loaded",
                projectRoot: resolvedRoot,
                game: game.getManifest(),
                type: identity?.type,
                capabilities: identity?.capabilities,
                origin: identity?.origin,
            };
        } finally {
            await resolution.release();
        }
    } catch (error) {
        return {status: "error", projectRoot: resolvedRoot, error: error instanceof Error ? error.message : String(error)};
    }
}
