import {ArtifactBuildConflictError, ArtifactBuilderRegistry, ArtifactTargetType, ProjectResolving, ProjectTargetResolver} from "pokie";
import path from "path";
import type {StudioArtifactBuildView} from "./StudioArtifactBuildView.js";
import type {StudioArtifactTargetView} from "./StudioArtifactTargetView.js";

// "parWorkbook" is the one target whose artifact is a single file rather than a directory -- its default
// destination needs a real file extension, mirroring BuildCommand's own PAR_WORKBOOK_DEFAULT_EXTENSION.
const PAR_WORKBOOK_DEFAULT_EXTENSION = ".xlsx";

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
        registry: ArtifactBuilderRegistry = new ArtifactBuilderRegistry(pokieVersion),
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
    ) {
        this.registry = registry;
        this.resolveProject = resolveProject;
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

    // Executes a real build against the active project -- resolves `projectRoot` into a PokieProject
    // exactly like BuildCommand does, re-checks the same capability listTargets() already reported (so a
    // stale client-side target list can never trigger a build the registry itself would reject), then
    // hands off to ArtifactBuilderRegistry.build() with `outDir` defaulted the same way a bare
    // `pokie build <project> --target <target>` (no --out) is. A destination conflict surfaces as its own
    // "conflict" status (never a bare 500) since ArtifactBuildConflictError is the one error every concrete
    // ArtifactBuilder throws for "destination already occupied" -- see assertArtifactDestinationAvailable's
    // own doc comment.
    public async build(projectRoot: string, target: ArtifactTargetType, outDir?: string): Promise<StudioArtifactBuildView> {
        const project = await this.resolveProject.resolve(projectRoot);
        if (project === undefined) {
            return {status: "error", message: `"${projectRoot}" was not recognized as a POKIE project.`};
        }

        if (!this.registry.supportsConversionFrom(target, project.type)) {
            const descriptor = this.registry.describe(target);
            const supported = descriptor.supportedSources.length > 0 ? descriptor.supportedSources.join(", ") : "none today";
            return {
                status: "unsupported",
                target,
                message: `"${target}" cannot be built from a "${project.type}" project. Supported sources: ${supported}. ${descriptor.unsupportedNotes.join(" ")}`,
            };
        }

        const destination = outDir ?? resolveDefaultDestination(project.rootPath, target);

        try {
            const result = await this.registry.build(target, project, destination);
            return {status: "ok", target, outputPath: result.outputPath, sourceType: project.type};
        } catch (error) {
            if (error instanceof ArtifactBuildConflictError) {
                return {status: "conflict", target, message: error.message};
            }
            return {status: "error", message: error instanceof Error ? error.message : String(error)};
        }
    }
}
