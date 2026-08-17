import {ArtifactBuildConflictError, ArtifactBuilderRegistry, ArtifactTargetType, PokieProject, ProjectResolving, ProjectTargetResolver} from "pokie";
import path from "path";
import type {StudioArtifactBuildView} from "./StudioArtifactBuildView.js";
import type {StudioArtifactPreviewView} from "./StudioArtifactPreviewView.js";
import type {StudioArtifactTargetView} from "./StudioArtifactTargetView.js";

// "parWorkbook" is the one target whose artifact is a single file rather than a directory -- its default
// destination needs a real file extension, mirroring BuildCommand's own PAR_WORKBOOK_DEFAULT_EXTENSION.
const PAR_WORKBOOK_DEFAULT_EXTENSION = ".xlsx";

function destinationKindFor(target: ArtifactTargetType): "file" | "directory" {
    return target === "parWorkbook" ? "file" : "directory";
}

// This is intentionally a compact, target-level plan rather than a guessed inventory of generated
// files. Builders remain free to evolve their internal package layouts; the preflight promises the
// stable artifact(s) a user is choosing to create, without lying about incidental implementation files.
function plannedOutputsFor(target: ArtifactTargetType): readonly string[] {
    switch (target) {
        case "tsPackage":
            return ["Runnable TypeScript game package directory"];
        case "outcomeLibrary":
            return ["Outcome library bundle directory"];
        case "stakeAdapter":
            return ["Stake Engine export directory"];
        case "parWorkbook":
            return ["PAR workbook (.xlsx) file"];
        case "wasm":
            return ["WASM artifact"];
        default:
            throw new Error(`Unknown artifact target: ${target}`);
    }
}

// The default destination when a build request omits "outDir" -- a `target`-named sibling of the
// resolved project's own rootPath, the exact same default BuildCommand.resolveDestination() computes for
// a bare `pokie build <project> --target <target>` (no --out). Keeping this identical means Studio's own
// zero-configuration "Build" click and the CLI's own default land in the same place for the same project.
function resolveDefaultDestination(rootPath: string, target: ArtifactTargetType): string {
    const siblingName = target === "parWorkbook" ? `${target}${PAR_WORKBOOK_DEFAULT_EXTENSION}` : target;
    return path.join(path.dirname(rootPath), siblingName);
}

// The Project Dashboard's Build/Export tab's own "Build artifact" group (see ExportDeployTab.tsx) -- the
// *only* Studio surface that runs the active project through ArtifactBuilderRegistry directly, the same
// closed tsPackage/outcomeLibrary/stakeAdapter/parWorkbook/wasm vocabulary and the same
// resolve -> capability-check -> build pipeline "pokie build <project> --target <target>" itself runs (see
// cli/commands/BuildCommand.ts) -- never a second, Studio-only build or serialization path.
//
// Deliberately separate from StudioOutcomeLibraryGenerateService/StudioStakeEngineExportService: those
// generate a fresh outcome library, or export one with per-mode cost, *from* a runnable game -- an
// operation ArtifactBuilderRegistry's own "outcomeLibrary"/"stakeAdapter" targets explicitly do not
// perform (each only republishes an already-built artifact of its own type to a new location; see
// ArtifactBuilderRegistry's own UNSUPPORTED_NOTES). This service only ever runs that same narrower
// republish -- or a "blueprint" source's own tsPackage build -- exactly like the CLI, so the two Studio
// surfaces stay two legitimately different pipelines rather than one masquerading as the other (see
// ExportDeployTargets.ts's own top-level doc comment).
export class StudioArtifactBuildService {
    private readonly registry: ArtifactBuilderRegistry;
    private readonly resolveProject: ProjectResolving;

    constructor(
        pokieVersion: string,
        registry?: ArtifactBuilderRegistry,
        resolveProject?: ProjectResolving,
        private readonly registerManagedProject: (projectRoot: string) => Promise<void> = () => Promise.resolve(),
    ) {
        this.registry = registry ?? new ArtifactBuilderRegistry(pokieVersion);
        this.resolveProject = resolveProject ?? new ProjectTargetResolver();
    }

    // Every target ArtifactBuilderRegistry knows about, alongside whether the active project (by its own
    // resolved ProjectType) actually supports building it -- the exact same registry.supportsConversionFrom()
    // check BuildCommand itself runs, computed once here so ExportDeployTab never re-derives a ProjectType/
    // capability rule of its own.
    public async listTargets(projectRoot: string): Promise<readonly StudioArtifactTargetView[]> {
        const project = await this.resolveProject.resolve(projectRoot);
        return this.registry.listTargets().map((target) => {
            const descriptor = this.registry.describe(target);
            return {
                target,
                supported: project !== undefined && this.registry.supportsConversionFrom(target, project.type),
                unsupportedNotes: descriptor.unsupportedNotes,
            };
        });
    }

    // Reports what a build against the active project would do, without ever invoking a builder -- the same
    // registry-resolved target/destination/capability diagnostic build() itself uses (see
    // ArtifactBuilderRegistry.checkDestination's own doc comment for why this never needs to run the builder
    // to know whether its destination would be accepted), so Build/Export can show a real destination and
    // conflict/diagnostic before the user ever clicks Build. Never writes anything.
    public async preview(projectRoot: string, target: ArtifactTargetType, outDir?: string): Promise<StudioArtifactPreviewView> {
        const resolved = await this.resolveForTarget(projectRoot, target, outDir);
        if (resolved === undefined) {
            return {status: "error", message: `"${projectRoot}" was not recognized as a POKIE project.`};
        }
        const {project, destination} = resolved;
        const destinationKind = destinationKindFor(target);
        const plannedOutputs = plannedOutputsFor(target);

        if (!this.registry.supportsConversionFrom(target, project.type)) {
            return {status: "unsupported", target, message: this.describeUnsupportedMessage(target, project)};
        }

        const destinationCheck = this.registry.checkDestination(target, destination);
        if (!destinationCheck.available) {
            return {status: "conflict", target, destination, destinationKind, plannedOutputs, message: destinationCheck.message};
        }

        return {status: "ok", target, destination, destinationKind, plannedOutputs, sourceType: project.type};
    }

    // Executes a real build against the active project -- resolves `projectRoot` into a PokieProject
    // exactly like BuildCommand does, re-checks the same capability listTargets()/preview() already reported
    // (so a stale client-side target list or preview can never trigger a build the registry itself would
    // reject), then hands off to ArtifactBuilderRegistry.build() with `outDir` defaulted the same way a bare
    // `pokie build <project> --target <target>` (no --out) is. A destination conflict surfaces as its own
    // "conflict" status (never a bare 500) since ArtifactBuildConflictError is the one error every concrete
    // ArtifactBuilder throws for "destination already occupied" -- see assertArtifactDestinationAvailable's
    // own doc comment.
    public async build(projectRoot: string, target: ArtifactTargetType, outDir?: string): Promise<StudioArtifactBuildView> {
        const resolved = await this.resolveForTarget(projectRoot, target, outDir);
        if (resolved === undefined) {
            return {status: "error", message: `"${projectRoot}" was not recognized as a POKIE project.`};
        }
        const {project, destination} = resolved;

        if (!this.registry.supportsConversionFrom(target, project.type)) {
            return {status: "unsupported", target, message: this.describeUnsupportedMessage(target, project)};
        }

        try {
            const result = await this.registry.build(target, project, destination);
            // A Blueprint -> Stake request may have caused the registry to create/open its canonical
            // Outcome Project.  Register that exact resolved path with Studio's authoritative Projects
            // registry before reporting success; no Studio-only outcome-path index is maintained here.
            await Promise.all((result.prerequisiteProjectRoots ?? []).map((projectRoot) => this.registerManagedProject(projectRoot)));
            return {status: "ok", target, outputPath: result.outputPath, outputKind: destinationKindFor(target), sourceType: project.type};
        } catch (error) {
            if (error instanceof ArtifactBuildConflictError) {
                return {status: "conflict", target, message: error.message};
            }
            return {status: "error", message: error instanceof Error ? error.message : String(error)};
        }
    }

    // Resolves `projectRoot` into a PokieProject and `target`'s own default destination -- the exact same
    // resolve/default-destination steps both preview() and build() need before they diverge into "just check"
    // vs. "actually write". Returns `undefined` for an unrecognized project (both callers report their own
    // "error" status for that).
    private async resolveForTarget(
        projectRoot: string,
        target: ArtifactTargetType,
        outDir: string | undefined,
    ): Promise<{project: PokieProject; destination: string} | undefined> {
        const project = await this.resolveProject.resolve(projectRoot);
        if (project === undefined) {
            return undefined;
        }
        return {project, destination: outDir ?? resolveDefaultDestination(project.rootPath, target)};
    }

    // The exact prose build() and preview() both report for a target this project's own resolved type
    // doesn't support -- the same registry.supportsConversionFrom() capability diagnostic, worded identically
    // in both places so a preview's "unsupported" and a subsequent build's own "unsupported" (should a stale
    // client ever call build() without previewing first) are never two differently-worded statements of the
    // same fact.
    private describeUnsupportedMessage(target: ArtifactTargetType, project: PokieProject): string {
        const descriptor = this.registry.describe(target);
        const supported = descriptor.supportedSources.length > 0 ? descriptor.supportedSources.join(", ") : "none today";
        return `"${target}" cannot be built from a "${project.type}" project. Supported sources: ${supported}. ${descriptor.unsupportedNotes.join(" ")}`;
    }
}
