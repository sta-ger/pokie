import {
    ArtifactBuildConflictError,
    ArtifactBuildCancelledError,
    type ArtifactConversionPlan,
    type ArtifactBuildOptions,
    type ArtifactBuildProgress,
    ArtifactBuilderRegistry,
    ArtifactTargetType,
    describeArtifactConversionPlanDiagnostic,
    ManagedOutcomeProjectService,
    ManagedOutcomeProjectServicing,
    PokieProject,
    ProjectResolving,
    ProjectTargetResolver,
} from "pokie";
import path from "path";
import type {StudioArtifactBuildView} from "./StudioArtifactBuildView.js";
import type {StudioArtifactBuildJobView, StudioArtifactBuildProgressView} from "./StudioArtifactBuildJobView.js";
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
// matrix-advertised tsPackage/outcomeLibrary/stakeAdapter/parWorkbook vocabulary and the same
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
    private readonly jobs = new Map<string, StudioArtifactBuildJobRecord>();
    private nextJobId = 1;

    constructor(
        pokieVersion: string,
        registry?: ArtifactBuilderRegistry,
        resolveProject?: ProjectResolving,
        private readonly registerManagedProject: (projectRoot: string) => Promise<void> = () => Promise.resolve(),
        managedOutcomeProjects?: ManagedOutcomeProjectServicing,
        pokiePackageRoot?: string,
    ) {
        this.resolveProject = resolveProject ?? new ProjectTargetResolver();
        this.registry = registry ?? new ArtifactBuilderRegistry(pokieVersion, undefined, managedOutcomeProjects ?? new ManagedOutcomeProjectService(this.resolveProject));
        if (pokiePackageRoot !== undefined) this.registry.withRuntimePackageRoot(pokiePackageRoot);
    }

    // Every target ArtifactBuilderRegistry knows about, alongside whether the active project (by its own
    // resolved ProjectType) actually supports building it -- the exact same registry.supportsConversionFrom()
    // check BuildCommand itself runs, computed once here so ExportDeployTab never re-derives a ProjectType/
    // capability rule of its own.
    public async listTargets(projectRoot: string): Promise<readonly StudioArtifactTargetView[]> {
        const project = await this.resolveProject.resolve(projectRoot);
        return Promise.all(this.registry.listTargets().map(async (target) => {
            const descriptor = this.registry.describe(target);
            const plan = project === undefined ? undefined : await this.plan(project, target);
            const plannerFields = this.targetPlannerFields(plan);
            return {
                target,
                supported: plan?.status === "planned",
                state: plan?.status === "planned" ? "supported" : "diagnostic-required",
                ...plannerFields,
                unsupportedNotes: descriptor.unsupportedNotes,
            };
        }));
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

        const plan = await this.plan(project, target, destination);
        if (plan.status === "unavailable") {
            return {status: "unsupported", target, message: this.describePlanDiagnostic(plan), plan};
        }
        if (plan.status === "conflict") {
            return {status: "conflict", target, destination, destinationKind, plannedOutputs, message: plan.diagnostic!.message, plan};
        }

        return {status: "ok", target, destination, destinationKind, plannedOutputs, sourceType: project.type, plan};
    }

    // Executes a real build against the active project -- resolves `projectRoot` into a PokieProject
    // exactly like BuildCommand does, re-checks the same capability listTargets()/preview() already reported
    // (so a stale client-side target list or preview can never trigger a build the registry itself would
    // reject), then hands off to ArtifactBuilderRegistry.build() with `outDir` defaulted the same way a bare
    // `pokie build <project> --target <target>` (no --out) is. A destination conflict surfaces as its own
    // "conflict" status (never a bare 500) since ArtifactBuildConflictError is the one error every concrete
    // ArtifactBuilder throws for "destination already occupied" -- see assertArtifactDestinationAvailable's
    // own doc comment.
    public async build(
        projectRoot: string,
        target: ArtifactTargetType,
        outDir?: string,
        options?: ArtifactBuildOptions,
    ): Promise<StudioArtifactBuildView> {
        const resolved = await this.resolveForTarget(projectRoot, target, outDir);
        if (resolved === undefined) {
            return {status: "error", message: `"${projectRoot}" was not recognized as a POKIE project.`};
        }
        const {project, destination} = resolved;

        const plan = await this.plan(project, target, destination, options);
        if (plan.status === "unavailable") {
            return {status: "unsupported", target, message: this.describePlanDiagnostic(plan), plan};
        }
        if (plan.status === "conflict") return {status: "conflict", target, message: plan.diagnostic!.message, plan};

        try {
            const result = await this.registry.executePlan(plan, project, destination, options);
            // Blueprint -> Outcome and Blueprint -> Stake both return the exact managed Outcome Project
            // the registry generated or reopened. Register it with Studio before reporting success; no
            // Studio-only outcome-path index is maintained here.
            const managedProjectRoots = new Set([
                ...(result.prerequisiteProjectRoots ?? []),
                ...(result.managedProjectRoots ?? []),
            ]);
            await Promise.all(Array.from(managedProjectRoots, (projectRoot) => this.registerManagedProject(projectRoot)));
            return {
                status: "ok",
                target,
                outputPath: result.outputPath,
                outputKind: destinationKindFor(target),
                sourceType: project.type,
                plan,
                ...(result.preflight !== undefined
                    ? {
                        preflight: {
                            ...(result.preflight.estimatedItemCount !== undefined
                                ? {estimatedItemCount: result.preflight.estimatedItemCount.toString()}
                                : {}),
                            ...(result.preflight.estimatedBytes !== undefined ? {estimatedBytes: result.preflight.estimatedBytes.toString()} : {}),
                            ...(result.preflight.complexityWarning !== undefined ? {complexityWarning: result.preflight.complexityWarning} : {}),
                        },
                    }
                    : {}),
                ...(result.reusedCompatibleProject
                    ? {
                        requestedDestinationPath: result.requestedDestinationPath,
                        reusedCompatibleProject: true,
                    }
                    : {}),
            };
        } catch (error) {
            if (error instanceof ArtifactBuildConflictError) {
                return {status: "conflict", target, message: error.message};
            }
            if (error instanceof ArtifactBuildCancelledError) {
                return {status: "cancelled", message: "Artifact build was cancelled."};
            }
            return {status: "error", message: error instanceof Error ? error.message : String(error)};
        }
    }

    // Starts independently from the request that created it, so a client can observe the preflight and
    // every running update rather than waiting for one terminal HTTP response.  Retention is bounded;
    // active jobs are never evicted.
    public start(projectRoot: string, target: ArtifactTargetType, outDir?: string): StudioArtifactBuildJobView {
        this.trimTerminalJobs();
        const record: StudioArtifactBuildJobRecord = {
            id: String(this.nextJobId++),
            projectRoot,
            target,
            status: "queued",
            cancellationRequested: false,
            controller: new AbortController(),
        };
        this.jobs.set(record.id, record);
        queueMicrotask(() => {
            this.run(record, outDir).catch(() => {
                // run() converts every builder failure into the public terminal result.
            });
        });
        return this.toJobView(record);
    }

    public getStatusForProject(projectRoot: string, id: string): StudioArtifactBuildJobView | undefined {
        const record = this.jobs.get(id);
        return record?.projectRoot === projectRoot ? this.toJobView(record) : undefined;
    }

    public cancelForProject(projectRoot: string, id: string): StudioArtifactBuildJobView | undefined {
        const record = this.jobs.get(id);
        if (record === undefined || record.projectRoot !== projectRoot) return undefined;
        if (record.status === "queued" || record.status === "running") {
            record.cancellationRequested = true;
            record.controller.abort();
        }
        return this.toJobView(record);
    }

    public cancelActiveForProject(projectRoot: string): void {
        for (const record of this.jobs.values()) {
            if (record.projectRoot === projectRoot && (record.status === "queued" || record.status === "running")) {
                record.cancellationRequested = true;
                record.controller.abort();
            }
        }
    }

    public cancelAll(): void {
        for (const record of this.jobs.values()) {
            if (record.status === "queued" || record.status === "running") {
                record.cancellationRequested = true;
                record.controller.abort();
            }
        }
    }

    private async run(record: StudioArtifactBuildJobRecord, outDir: string | undefined): Promise<void> {
        record.status = "running";
        const result = await this.build(record.projectRoot, record.target, outDir, {
            signal: record.controller.signal,
            onProgress: (progress) => {
                const next = toProgressView(progress);
                // Builders normally report preflight once and subsequent running callbacks without
                // repeating it. Keep that estimate attached to the latest live snapshot so a poller
                // cannot miss it between the two callbacks.
                record.progress = next.preflight === undefined && record.progress?.preflight !== undefined
                    ? {...next, preflight: record.progress.preflight}
                    : next;
            },
        });
        const status = terminalStatusFor(result);
        Object.assign(record, {result, status});
    }

    private toJobView(record: StudioArtifactBuildJobRecord): StudioArtifactBuildJobView {
        return {
            id: record.id,
            target: record.target,
            status: record.status,
            cancellationRequested: record.cancellationRequested,
            ...(record.progress !== undefined ? {progress: record.progress} : {}),
            ...(record.result !== undefined ? {result: record.result} : {}),
        };
    }

    private trimTerminalJobs(): void {
        const terminal = Array.from(this.jobs.values()).filter((job) => job.status !== "queued" && job.status !== "running");
        while (terminal.length >= 20) {
            const oldest = terminal.shift();
            if (oldest !== undefined) this.jobs.delete(oldest.id);
        }
    }

    private plan(project: PokieProject, target: ArtifactTargetType, destinationPath?: string, options?: ArtifactBuildOptions): Promise<ArtifactConversionPlan> {
        return this.registry.preparePlan(project, target, {destinationPath, outcomeLibraryGeneration: options?.outcomeLibraryGeneration});
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

    private describePlanDiagnostic(plan: ArtifactConversionPlan): string {
        const diagnostic = plan.diagnostic;
        return diagnostic === undefined
            ? "Artifact conversion is unavailable."
            : describeArtifactConversionPlanDiagnostic(plan) ?? `${diagnostic.message} Next: ${diagnostic.recovery}`;
    }

    private targetPlannerFields(plan: ArtifactConversionPlan | undefined): {readonly diagnostic?: string; readonly plan?: ArtifactConversionPlan} {
        if (plan === undefined) return {};
        if (plan.status === "unavailable") return {diagnostic: this.describePlanDiagnostic(plan), plan};
        return {plan};
    }
}

function terminalStatusFor(result: StudioArtifactBuildView): "completed" | "failed" | "cancelled" {
    if (result.status === "cancelled") return "cancelled";
    return result.status === "ok" ? "completed" : "failed";
}

type StudioArtifactBuildJobRecord = {
    readonly id: string;
    readonly projectRoot: string;
    readonly target: ArtifactTargetType;
    status: "queued" | "running" | "completed" | "failed" | "cancelled";
    cancellationRequested: boolean;
    readonly controller: AbortController;
    progress?: StudioArtifactBuildProgressView;
    result?: StudioArtifactBuildView;
};

function toProgressView(progress: ArtifactBuildProgress): StudioArtifactBuildProgressView {
    return {
        status: progress.status,
        ...(progress.completed !== undefined ? {completed: progress.completed.toString()} : {}),
        ...(progress.total !== undefined ? {total: progress.total.toString()} : {}),
        ...(progress.preflight !== undefined
            ? {
                preflight: {
                    ...(progress.preflight.estimatedItemCount !== undefined ? {estimatedItemCount: progress.preflight.estimatedItemCount.toString()} : {}),
                    ...(progress.preflight.estimatedBytes !== undefined ? {estimatedBytes: progress.preflight.estimatedBytes.toString()} : {}),
                    ...(progress.preflight.complexityWarning !== undefined ? {complexityWarning: progress.preflight.complexityWarning} : {}),
                },
            }
            : {}),
        ...(progress.message !== undefined ? {message: progress.message} : {}),
    };
}
