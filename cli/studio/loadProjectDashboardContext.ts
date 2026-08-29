import {loadPokieGame, OutcomeSourceProjectAnalyzer, OutcomeSourceProjectReport, PokieProject, ProjectTargetResolver, type ProjectType} from "pokie";
import path from "path";
import {BlueprintMaterializationError} from "../materialize/BlueprintMaterializationError.js";
import {RuntimePreparationError} from "../materialize/RuntimePreparationError.js";
import {passthroughRuntimePackageResolver, RuntimePackageResolving} from "../materialize/materializeRuntimePackage.js";
import type {ProjectDashboardContext} from "./ProjectDashboardContext.js";
import type {StudioProjectOrigin} from "./StudioProjectRegistryEntry.js";

export type ProjectLocationDescribing = (
    location: string,
) => Promise<{type: ProjectType; capabilities: readonly string[]; origin?: StudioProjectOrigin} | undefined>;

// Defaults to "nothing known" so every existing caller/test keeps behaving exactly as before
// type/capabilities/origin existed on this result.
const noDescribeLocation: ProjectLocationDescribing = () => Promise.resolve(undefined);

// Resolves `projectRoot` to its own canonical outcome-source exact analysis when (and only when) it
// resolves to an "outcomeLibrary"/"stakeAdapter" PokieProject -- `undefined` for every other resolved
// type (or an unresolvable/ambiguous/unreadable location), so loadProjectDashboardContext can next check
// for an exchange-only artifact and otherwise fall through to the ordinary loadGame path. Injectable so a
// test never touches the real filesystem/canonical readers; defaults to a real ProjectTargetResolver/OutcomeSourceProjectAnalyzer
// pair, mirroring ReportCommand's/OutcomeSourceCommand's own default wiring -- neither has any
// construction-time dependency of its own, so (unlike resolveRuntimePackageRoot/describeLocation above)
// there's no reason to default this to a no-op.
export type OutcomeSourceProjectResolving = (
    projectRoot: string,
) => Promise<{project: PokieProject; report: OutcomeSourceProjectReport} | undefined>;

const defaultResolveOutcomeSourceProject: OutcomeSourceProjectResolving = async (projectRoot) => {
    const project = await new ProjectTargetResolver().resolve(projectRoot).catch(() => undefined);
    if (project === undefined || (project.type !== "outcomeLibrary" && project.type !== "stakeAdapter")) {
        return undefined;
    }
    const report = await new OutcomeSourceProjectAnalyzer().analyze(project);
    return {project, report};
};

// Resolves artifacts which deliberately have no runtime path. PAR is omitted:
// runnable-compatible workbooks go through the shared runtime planner below.
export type ArtifactProjectResolving = (projectRoot: string) => Promise<PokieProject | undefined>;

export type ProjectDashboardLoadOptions = {readonly signal?: AbortSignal};

const defaultResolveArtifactProject: ArtifactProjectResolving = () => Promise.resolve(undefined);

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
// failure a user would have to guess the cause of. A BlueprintMaterializationError's own "details" (a
// failed materialization "npm install"'s real stderr) rides along separately as this result's own
// "errorDetail" -- see ProjectDashboardContext's own doc comment. Defaults to a no-op passthrough so
// every existing caller/test keeps behaving exactly as before this boundary existed.
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
    resolveOutcomeSourceProject: OutcomeSourceProjectResolving = defaultResolveOutcomeSourceProject,
    resolveArtifactProject: ArtifactProjectResolving = defaultResolveArtifactProject,
    options: ProjectDashboardLoadOptions = {},
): Promise<ProjectDashboardContext> {
    assertDashboardLoadNotCancelled(options.signal);
    const resolvedRoot = path.resolve(projectRoot);

    // Checked first, before ever touching resolveRuntimePackageRoot/loadGame: an "outcomeLibrary"/
    // "stakeAdapter" `projectRoot` has no materialized runtime to load at all (neither type ever gains
    // RUNTIME_EXECUTE_CAPABILITY), so attempting the ordinary path below would always fail with an
    // UnsupportedProjectOperationError. `undefined` here means "not one of those two types" (or
    // unresolvable), so every existing tsPackage/blueprint/wasm caller falls straight through
    // to the unchanged path below.
    const outcomeSource = await resolveOutcomeSourceProject(projectRoot).catch(() => undefined);
    assertDashboardLoadNotCancelled(options.signal);
    if (outcomeSource !== undefined) {
        const identity = await describeLocation(projectRoot).catch(() => undefined);
        return {
            status: "outcome-source",
            projectRoot: resolvedRoot,
            project: outcomeSource.project,
            origin: identity?.origin,
            report: outcomeSource.report,
        };
    }

    // Keep any truly non-runnable artifact visible without claiming it loaded.
    const artifact = await resolveArtifactProject(projectRoot).catch(() => undefined);
    assertDashboardLoadNotCancelled(options.signal);
    if (artifact !== undefined) {
        const identity = await describeLocation(projectRoot).catch(() => undefined);
        return {
            status: "artifact",
            projectRoot: resolvedRoot,
            project: artifact,
            origin: identity?.origin,
        };
    }

    try {
        const resolution = options.signal === undefined
            ? await resolveRuntimePackageRoot(projectRoot)
            : await resolveRuntimePackageRoot(projectRoot, {signal: options.signal});
        try {
            assertDashboardLoadNotCancelled(options.signal);
            const game = await loadGame(resolution.runtimePath);
            assertDashboardLoadNotCancelled(options.signal);
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
        return {
            status: "error",
            projectRoot: resolvedRoot,
            error: error instanceof Error ? error.message : String(error),
            errorDetail: error instanceof BlueprintMaterializationError || error instanceof RuntimePreparationError ? error.details : undefined,
        };
    }
}

function assertDashboardLoadNotCancelled(signal: AbortSignal | undefined): void {
    if (signal?.aborted) {
        throw new Error("Runtime preparation was cancelled before a runnable game was available.");
    }
}
