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
    assertArtifactBuildNotCancelled,
    describeWasmLifecycleBoundary,
    describeUnsupportedProjectOperation,
    isWasmComponentFile,
    StakeProjectionExportService,
    type PreparedStakeProjectionOperation,
} from "pokie";
import path from "path";
import fs from "fs";
import type {StudioArtifactBuildView} from "./StudioArtifactBuildView.js";
import type {StudioArtifactBuildJobView, StudioArtifactBuildProgressView} from "./StudioArtifactBuildJobView.js";
import type {StudioArtifactPreviewView} from "./StudioArtifactPreviewView.js";
import type {StudioArtifactTargetView} from "./StudioArtifactTargetView.js";
import {createUnresolvedRuntimePlan} from "./createExternalArtifactConversionPlan.js";

export type StudioArtifactBuildStartResult =
    | {status: "created"; job: StudioArtifactBuildJobView}
    | {status: "unsupported"; message: string};

export type StudioPreparedStakeProjectionStartResult =
    | {status: "created"; job: StudioArtifactBuildJobView}
    | {status: "unsupported"; message: string}
    | {status: "stale"};

// "parWorkbook" is the one target whose artifact is a single file rather than a directory -- its default
// destination needs a real file extension, mirroring BuildCommand's own PAR_WORKBOOK_DEFAULT_EXTENSION.
const PAR_WORKBOOK_DEFAULT_EXTENSION = ".xlsx";

function destinationKindFor(target: ArtifactTargetType): "file" | "directory" {
    return target === "parWorkbook" || target === "blueprint" ? "file" : "directory";
}

// This is intentionally a compact, target-level plan rather than a guessed inventory of generated
// files. Builders remain free to evolve their internal package layouts; the preflight promises the
// stable artifact(s) a user is choosing to create, without lying about incidental implementation files.
function plannedOutputsFor(target: ArtifactTargetType): readonly string[] {
    switch (target) {
        case "blueprint":
            return ["Game Blueprint JSON file with PAR conversion evidence"];
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
    let siblingName: string = target;
    if (target === "parWorkbook") siblingName = `${target}${PAR_WORKBOOK_DEFAULT_EXTENSION}`;
    if (target === "blueprint") siblingName = "blueprint.json";
    return path.join(path.dirname(rootPath), siblingName);
}

// The Project Dashboard's Build/Export tab's own "Build artifact" group (see ExportDeployTab.tsx) -- the
// *only* Studio surface that runs the active project through ArtifactBuilderRegistry directly, the same
// matrix-advertised tsPackage/outcomeLibrary/stakeAdapter/parWorkbook vocabulary and the same
// resolve -> capability-check -> build pipeline "pokie build <project> --target <target>" itself runs (see
// cli/commands/BuildCommand.ts) -- never a second, Studio-only build or serialization path.
//
// StudioOutcomeLibraryGenerateService remains the advanced, user-directed library action.  In contrast,
// the Build/Export Stake goal is deliberately complete from a Blueprint/package: the canonical projection
// service chooses a verified managed library or generation before publication.  The direct Stake service
// still supports its explicit per-mode Outcome Library input flow, but it must not become a hidden
// prerequisite for this project-goal action.
export class StudioArtifactBuildService {
    private readonly registry: ArtifactBuilderRegistry;
    private readonly stakeProjection: StakeProjectionExportService;
    private readonly resolveProject: ProjectResolving;
    private readonly jobs = new Map<string, StudioArtifactBuildJobRecord>();
    // A Stake preview is an executable capability decision. Retain the exact
    // operation server-side so Build never repeats its library lookup.
    private readonly preparedStakeOperations = new Map<string, PreparedStakeOperationRecord>();
    private nextJobId = 1;
    private nextPreparedStakeOperationId = 1;

    constructor(
        pokieVersion: string,
        registry?: ArtifactBuilderRegistry,
        resolveProject?: ProjectResolving,
        private readonly registerManagedProject: (projectRoot: string, provenance?: {readonly sourceWorkbookPath?: string; readonly conversionEvidencePath?: string}) => Promise<void> = () => Promise.resolve(),
        managedOutcomeProjects?: ManagedOutcomeProjectServicing,
        pokiePackageRoot?: string,
        // Registration is part of publication from Studio's point of view.
        // Keep the inverse beside the writer so a later registration failure
        // cannot leave an earlier parallel registration behind.
        private readonly unregisterManagedProject: (projectRoot: string) => Promise<void> = () => Promise.resolve(),
    ) {
        this.resolveProject = resolveProject ?? new ProjectTargetResolver();
        this.registry = registry ?? new ArtifactBuilderRegistry(pokieVersion, undefined, managedOutcomeProjects ?? new ManagedOutcomeProjectService(this.resolveProject));
        this.stakeProjection = new StakeProjectionExportService(this.registry);
        if (pokiePackageRoot !== undefined) this.registry.withRuntimePackageRoot(pokiePackageRoot);
    }

    // Every target ArtifactBuilderRegistry knows about, alongside whether the active project (by its own
    // resolved ProjectType) actually supports building it -- the exact same registry-supported plan BuildCommand
    // itself runs, computed once here so ExportDeployTab never re-derives a ProjectType/capability rule of its own.
    // This is intentionally destination-free: a target card describes whether a conversion is possible, while
    // preview() owns the chosen/default output's conflict diagnostic. In particular, a Stake export's default
    // sibling name is also its own root when a Stake export is reopened, which must not make its supported
    // republish edge disappear from the available-targets surface.
    public async listTargets(projectRoot: string): Promise<readonly StudioArtifactTargetView[]> {
        const project = await this.resolveProject.resolve(projectRoot);
        return Promise.all(this.registry.listTargets().map(async (target) => {
            const descriptor = this.registry.describe(target);
            const plan = project === undefined
                ? createUnresolvedRuntimePlan(projectRoot, target)
                : await this.plan(project, target);
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
            return {
                status: "error",
                message: `"${projectRoot}" was not recognized as a POKIE project.`,
                plan: createUnresolvedRuntimePlan(projectRoot, target, outDir),
            };
        }
        const {project, destination} = resolved;
        const destinationKind = destinationKindFor(target);
        const plannedOutputs = plannedOutputsFor(target);

        const operation = target === "stakeAdapter"
            ? await this.stakeProjection.prepareOperation(project, destination)
            : undefined;
        const plan = operation?.plan ?? await this.plan(project, target, destination);
        if (plan.status === "unavailable") {
            return {status: "unsupported", target, message: this.describePlanDiagnostic(plan), plan};
        }
        if (plan.status === "conflict") {
            return {status: "conflict", target, destination, destinationKind, plannedOutputs, message: plan.diagnostic!.message, plan};
        }

        const preparedOperationId = operation === undefined
            ? undefined
            : this.retainPreparedStakeOperation(projectRoot, operation);
        return {
            status: "ok",
            target,
            destination,
            destinationKind,
            plannedOutputs,
            sourceType: project.type,
            plan,
            ...(preparedOperationId === undefined ? {} : {preparedOperationId}),
            ...(operation === undefined ? {} : {stakePreflight: this.stakePreflightView(operation)}),
        };
    }

    /**
     * Validates the same prepared Blueprint/package-to-Stake projection used
     * by Build.  The legacy direct Stake endpoint uses this only for its
     * empty, project-goal request; explicit Outcome Library inputs retain
     * their descriptor validation boundary in StudioStakeEngineExportService.
     */
    public async prepareStakeProjection(projectRoot: string, outDir?: string): Promise<PreparedStakeProjectionOperation | undefined> {
        const resolved = await this.resolveForTarget(projectRoot, "stakeAdapter", outDir);
        if (resolved === undefined) return undefined;
        return this.stakeProjection.prepareOperation(resolved.project, resolved.destination);
    }

    public async validateStakeProjection(projectRoot: string, outDir?: string): Promise<{readonly plan: ArtifactConversionPlan; readonly operation: PreparedStakeProjectionOperation} | undefined> {
        const operation = await this.prepareStakeProjection(projectRoot, outDir);
        return operation === undefined ? undefined : {plan: operation.plan, operation};
    }

    /**
     * Advanced Outcome Library inputs use the same prepared Stake lifecycle as
     * a Blueprint/package goal.  `destinationPath` is already resolved by the
     * calling Studio boundary, so selecting a library never changes the final
     * destination that preflight inspected.
     */
    public async validateStakeProjectionSource(sourcePath: string, destinationPath: string): Promise<{readonly plan: ArtifactConversionPlan; readonly operation: PreparedStakeProjectionOperation} | undefined> {
        const source = await this.resolveProject.resolve(sourcePath);
        if (source === undefined) return undefined;
        const operation = await this.stakeProjection.prepareOperation(source, destinationPath);
        return {plan: operation.plan, operation};
    }

    public async buildStakeProjectionSource(
        sourcePath: string,
        destinationPath: string,
        options?: ArtifactBuildOptions,
    ): Promise<StudioArtifactBuildView> {
        const source = await this.resolveProject.resolve(sourcePath);
        if (source === undefined) {
            return {
                status: "error",
                message: `"${sourcePath}" was not recognized as a POKIE project.`,
                plan: createUnresolvedRuntimePlan(sourcePath, "stakeAdapter", destinationPath),
            };
        }
        const operation = await this.stakeProjection.prepareOperation(source, destinationPath, options);
        return this.executeStakeProjection(operation, options);
    }

    /** Execute a previously validated Studio Stake operation without preparing another plan. */
    public executeStakeProjection(operation: PreparedStakeProjectionOperation, options?: ArtifactBuildOptions): Promise<StudioArtifactBuildView> {
        return this.buildResolved(operation.source, "stakeAdapter", operation.destinationPath, options, operation);
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
            const plan = createUnresolvedRuntimePlan(projectRoot, target, outDir);
            return {status: "error", message: `"${projectRoot}" was not recognized as a POKIE project.`, plan};
        }
        return this.buildResolved(resolved.project, target, resolved.destination, options);
    }

    public async buildResolved(
        project: PokieProject,
        target: ArtifactTargetType,
        destination: string,
        options?: ArtifactBuildOptions,
        preparedStakeOperation?: PreparedStakeProjectionOperation,
    ): Promise<StudioArtifactBuildView> {
        // Directory targets deliberately accept a caller-created empty
        // destination.  It is not owned by this operation, even though its
        // contents will be, so a later Studio registration failure must leave
        // that directory in place.
        const outputDestinationExisted = fs.existsSync(destination);

        const operation = target === "stakeAdapter"
            ? preparedStakeOperation ?? await this.stakeProjection.prepareOperation(project, destination, options)
            : undefined;
        const plan = operation?.plan ?? await this.plan(project, target, destination, options);
        if (plan.status === "unavailable") {
            return {status: "unsupported", target, message: this.describePlanDiagnostic(plan), plan};
        }
        if (plan.status === "conflict") return {status: "conflict", target, message: plan.diagnostic!.message, plan};

        try {
            const result = target === "stakeAdapter"
                ? await this.stakeProjection.executeOperation(operation!, options)
                : await this.registry.executePlan(plan, project, destination, options);
            // executePlan's terminal writer has returned, but Studio has one
            // more publication boundary: project registration.  Honour the
            // same signal before exposing any registry entry or success DTO.
            assertArtifactBuildNotCancelled(options);
            // Blueprint -> Outcome and Blueprint -> Stake both return the exact managed Outcome Project
            // the registry generated or reopened. Register it with Studio before reporting success; no
            // Studio-only outcome-path index is maintained here.
            const managedProjectRoots = new Set([
                ...this.durableManagedRoots(result, plan),
                // A PAR import's Blueprint is itself a durable Studio project,
                // not merely a transient prerequisite like an Outcome bundle.
                ...(target === "blueprint" || project.type === "parWorkbook" ? [result.outputPath] : []),
                // Every PAR-derived terminal artifact owns a durable imported
                // Blueprint.  Register that model as well as the terminal so
                // a restart can reopen its workbook/evidence provenance.
                ...(result.importedBlueprintPath === undefined ? [] : [result.importedBlueprintPath]),
            ]);
            const registeredRoots: string[] = [];
            try {
                const provenance = await this.parImportRegistrationProvenance(result.conversionEvidencePath);
                for (const projectRoot of managedProjectRoots) {
                    assertArtifactBuildNotCancelled(options);
                    await this.registerManagedProject(
                        projectRoot,
                        // The terminal and the durable imported Blueprint both
                        // retain the same workbook/evidence provenance.
                        projectRoot === result.outputPath || projectRoot === result.importedBlueprintPath ? provenance : undefined,
                    );
                    registeredRoots.push(projectRoot);
                    assertArtifactBuildNotCancelled(options);
                }
            } catch (error) {
                // A Studio build is not successful until every operation-owned
                // publication is registered.  A managed Outcome may have been
                // registered by its generator before Studio reaches this loop,
                // so rollback is based on the selected plan's ownership, not
                // only the subset of callbacks that happened to return first.
                await this.rollbackRegistrationFailure(result, plan, registeredRoots, outputDestinationExisted);
                throw error;
            }
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
                ...(result.importedBlueprintPath !== undefined ? {importedBlueprintPath: result.importedBlueprintPath} : {}),
                ...(result.conversionEvidencePath !== undefined ? {conversionEvidencePath: result.conversionEvidencePath} : {}),
                ...(result.stakeManifest !== undefined ? {stakeManifest: result.stakeManifest, stakeFiles: result.stakeFiles ?? []} : {}),
                ...(operation === undefined ? {} : {stakePrerequisiteProvenance: this.stakePrerequisiteProvenance(operation, result)}),
            };
        } catch (error) {
            if (error instanceof ArtifactBuildConflictError) {
                return {status: "conflict", target, message: error.message, plan};
            }
            if (error instanceof ArtifactBuildCancelledError) {
                return {status: "cancelled", message: "Artifact build was cancelled.", plan};
            }
            return {status: "error", message: error instanceof Error ? error.message : String(error), plan};
        }
    }

    // Starts independently from the request that created it, so a client can observe the preflight and
    // every running update rather than waiting for one terminal HTTP response.  Retention is bounded;
    // active jobs are never evicted.
    public start(projectRoot: string, target: ArtifactTargetType, outDir?: string): StudioArtifactBuildStartResult {
        // A direct service caller has the same no-job boundary as the HTTP
        // route: a WASM path must never receive an id, destination, staging
        // plan, or queued builder merely to fail later.
        if (isWasmComponentFile(projectRoot)) {
            return {status: "unsupported", message: describeWasmLifecycleBoundary(projectRoot, "build a POKIE game package")};
        }
        return {status: "created", job: this.startOperation(projectRoot, target, outDir)};
    }

    /** Consume a preview-issued operation, rejecting stale or cross-project handles. */
    public async startPreparedStakeProjection(projectRoot: string, preparedOperationId: string): Promise<StudioPreparedStakeProjectionStartResult> {
        const prepared = this.preparedStakeOperations.get(preparedOperationId);
        if (prepared === undefined || prepared.projectRoot !== projectRoot) return {status: "stale"};

        // A prepared Stake operation is only a preflight snapshot. Re-resolve
        // immediately before allocating its job so a package path replaced by
        // an inspection-only component cannot consume the retained operation.
        try {
            const current = await this.resolveProject.resolve(projectRoot);
            if (current?.type === "wasm") {
                return {
                    status: "unsupported",
                    message: describeUnsupportedProjectOperation(current, "build a Stake Engine export")?.message
                        ?? describeWasmLifecycleBoundary(projectRoot, "build a Stake Engine export"),
                };
            }
            if (current === undefined && isWasmComponentFile(projectRoot)) {
                return {status: "unsupported", message: describeWasmLifecycleBoundary(projectRoot, "build a Stake Engine export")};
            }
            if (current === undefined) return {status: "stale"};
        } catch {
            if (isWasmComponentFile(projectRoot)) {
                return {status: "unsupported", message: describeWasmLifecycleBoundary(projectRoot, "build a Stake Engine export")};
            }
            return {status: "stale"};
        }
        this.preparedStakeOperations.delete(preparedOperationId);
        return {status: "created", job: this.startOperation(projectRoot, "stakeAdapter", prepared.operation.destinationPath, prepared.operation)};
    }

    /** Returns the destination bound by a preview without exposing its operation. */
    public preparedStakeProjectionDestination(projectRoot: string, preparedOperationId: string): string | undefined {
        const prepared = this.preparedStakeOperations.get(preparedOperationId);
        return prepared?.projectRoot === projectRoot ? prepared.operation.destinationPath : undefined;
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

    private startOperation(
        projectRoot: string,
        target: ArtifactTargetType,
        outDir?: string,
        preparedStakeOperation?: PreparedStakeProjectionOperation,
    ): StudioArtifactBuildJobView {
        this.trimTerminalJobs();
        const record: StudioArtifactBuildJobRecord = {
            id: String(this.nextJobId++),
            projectRoot,
            target,
            status: "queued",
            cancellationRequested: false,
            controller: new AbortController(),
            preparedStakeOperation,
        };
        this.jobs.set(record.id, record);
        queueMicrotask(() => {
            this.run(record, outDir).catch(() => {
                // run() converts every builder failure into the public terminal result.
            });
        });
        return this.toJobView(record);
    }

    private async run(record: StudioArtifactBuildJobRecord, outDir: string | undefined): Promise<void> {
        record.status = "running";
        const options: ArtifactBuildOptions = {
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
        };
        const result = record.preparedStakeOperation === undefined
            ? await this.build(record.projectRoot, record.target, outDir, options)
            : await this.executeStakeProjection(record.preparedStakeOperation, options);
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

    private retainPreparedStakeOperation(projectRoot: string, operation: PreparedStakeProjectionOperation): string {
        const id = `stake-${this.nextPreparedStakeOperationId++}`;
        this.preparedStakeOperations.set(id, {projectRoot, operation});
        while (this.preparedStakeOperations.size > 20) {
            const oldest = this.preparedStakeOperations.keys().next().value as string | undefined;
            if (oldest === undefined) break;
            this.preparedStakeOperations.delete(oldest);
        }
        return id;
    }

    private stakePreflightView(operation: PreparedStakeProjectionOperation): {
        readonly route: "reuse" | "generate" | "publish";
        readonly selectedPrerequisiteLocation?: string;
        readonly estimatedItemCount?: string;
        readonly estimatedBytes?: string;
        readonly complexityWarning?: string;
        readonly unavailableMetrics?: readonly string[];
        readonly warnings: readonly string[];
    } {
        const warnings: string[] = [];
        if (operation.preflight.route === "reuse") {
            warnings.push("A compatible managed Outcome Library will be reused.");
        }
        if (operation.preflight.route === "generate") {
            warnings.push("A compatible Outcome Library will be generated before Stake publication.");
        }
        return {
            route: operation.preflight.route,
            ...(operation.preflight.selectedPrerequisiteLocation === undefined ? {} : {selectedPrerequisiteLocation: operation.preflight.selectedPrerequisiteLocation}),
            ...(operation.preflight.estimatedItemCount === undefined ? {} : {estimatedItemCount: operation.preflight.estimatedItemCount.toString()}),
            ...(operation.preflight.estimatedBytes === undefined ? {} : {estimatedBytes: operation.preflight.estimatedBytes.toString()}),
            ...(operation.preflight.complexityWarning === undefined ? {} : {complexityWarning: operation.preflight.complexityWarning}),
            ...(operation.preflight.unavailableMetrics === undefined ? {} : {unavailableMetrics: operation.preflight.unavailableMetrics}),
            warnings,
        };
    }

    private stakePrerequisiteProvenance(
        operation: PreparedStakeProjectionOperation,
        result: import("pokie").ArtifactBuildResult,
    ): NonNullable<Extract<StudioArtifactBuildView, {readonly status: "ok"}>["stakePrerequisiteProvenance"]> {
        const source = operation.plan.source.configurationProvenance;
        const ownership = this.managedOutcomeOwnership(result, operation.plan)[0];
        let disposition: "borrowed" | "owned" | "transient" | "none" = "none";
        if (operation.preflight.route === "reuse") disposition = "borrowed";
        else if (operation.preflight.route === "generate") disposition = "owned";
        return {
            route: operation.preflight.route,
            ...(operation.preflight.selectedPrerequisiteLocation === undefined
                ? {selectedPrerequisiteLocation: ownership?.rootPath ?? result.prerequisiteProjectRoots?.[0]}
                : {selectedPrerequisiteLocation: operation.preflight.selectedPrerequisiteLocation}),
            disposition: ownership?.disposition ?? disposition,
            ...(source?.gameId === undefined ? {} : {sourceGameId: source.gameId}),
            ...(source?.gameVersion === undefined ? {} : {sourceGameVersion: source.gameVersion}),
            ...(source?.configurationHash === undefined ? {} : {sourceConfigurationHash: source.configurationHash}),
            ...(source?.pokieVersion === undefined ? {} : {sourcePokieVersion: source.pokieVersion}),
            ...(source?.generationSemantics === undefined ? {} : {generationSemantics: source.generationSemantics}),
            ...(source?.sampleCount === undefined ? {} : {sampleCount: source.sampleCount}),
            ...(source?.sampleSeed === undefined ? {} : {sampleSeed: source.sampleSeed}),
            ...(source?.maxExactOutcomeSpaceSize === undefined ? {} : {maxExactOutcomeSpaceSize: source.maxExactOutcomeSpaceSize}),
            ...(source?.compatibilityPolicyVersion === undefined ? {} : {compatibilityPolicyVersion: source.compatibilityPolicyVersion}),
        };
    }

    private plan(project: PokieProject, target: ArtifactTargetType, destinationPath?: string, options?: ArtifactBuildOptions): Promise<ArtifactConversionPlan> {
        return target === "stakeAdapter"
            ? this.stakeProjection.prepare(project, destinationPath, options)
            : this.registry.preparePlan(project, target, {destinationPath, outcomeLibraryGeneration: options?.outcomeLibraryGeneration});
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

    private targetPlannerFields(plan: ArtifactConversionPlan): {readonly diagnostic?: string; readonly plan: ArtifactConversionPlan} {
        if (plan.status === "unavailable") return {diagnostic: this.describePlanDiagnostic(plan), plan};
        return {plan};
    }

    private async rollbackRegistrationFailure(
        result: import("pokie").ArtifactBuildResult,
        plan: ArtifactConversionPlan,
        registeredRoots: readonly string[],
        outputDestinationExisted: boolean,
    ): Promise<void> {
        const managedOwnership = this.managedOutcomeOwnership(result, plan);
        const ownedManagedRoots = managedOwnership
            .filter((entry) => entry.disposition === "owned")
            .map((entry) => entry.rootPath);
        // The terminal is always newly allocated after the registry's
        // destination check.  The imported Blueprint is likewise a fresh
        // durable PAR intermediate. Generated prerequisite roots are owned by
        // this operation; reused managed outcomes are deliberately excluded.
        const ownedRoots = new Set<string>([
            result.outputPath,
            ...(result.importedBlueprintPath === undefined ? [] : [result.importedBlueprintPath]),
            ...ownedManagedRoots,
        ]);

        const rollbackRoots = [
            // Do not limit this to `registeredRoots`: ManagedOutcomeProjectService
            // can register generated roots while materializing them, before the
            // Studio-level registration loop starts.
            ...new Set([...registeredRoots, ...ownedRoots]).values(),
        ].sort((left, right) => right.length - left.length);
        for (const projectRoot of rollbackRoots) {
            if (!ownedRoots.has(projectRoot)) continue;
            await this.unregisterManagedProject(projectRoot).catch(() => undefined);
            // The registry may have registered a generated Outcome before
            // Studio reaches its own project-registration loop.  Releasing
            // that record is a separate operation from removing the root: a
            // deleted bundle must never remain advertised as reusable.
            const ownership = managedOwnership.find((entry) => entry.rootPath === projectRoot && entry.disposition === "owned");
            if (ownership !== undefined) {
                const registry = this.registry as ArtifactBuilderRegistry & {
                    releaseManagedOutcomeProject?: (sourceRootPath: string, rootPath: string) => Promise<void>;
                };
                if (registry.releaseManagedOutcomeProject !== undefined) {
                    await registry.releaseManagedOutcomeProject(ownership.sourceRootPath, projectRoot).catch(() => undefined);
                }
            }
            if (projectRoot === result.outputPath && outputDestinationExisted) {
                // The destination was a caller-owned empty directory at
                // preflight.  Remove only this operation's publication and
                // preserve the destination itself for its owner.
                await fs.promises.readdir(projectRoot)
                    .then((entries) => Promise.all(entries.map((entry) => fs.promises.rm(path.join(projectRoot, entry), {recursive: true, force: true}))))
                    .catch(() => undefined);
            } else {
                await fs.promises.rm(projectRoot, {recursive: true, force: true}).catch(() => undefined);
            }
            await fs.promises.rm(`${projectRoot}.conversion-evidence.json`, {force: true}).catch(() => undefined);
        }
    }

    private durableManagedRoots(result: import("pokie").ArtifactBuildResult, plan: ArtifactConversionPlan): readonly string[] {
        const ownership = this.managedOutcomeOwnership(result, plan);
        const transient = new Set(ownership.filter((entry) => entry.disposition === "transient").map((entry) => entry.rootPath));
        return Array.from(new Set([...(result.prerequisiteProjectRoots ?? []), ...(result.managedProjectRoots ?? [])]))
            .filter((root) => !transient.has(root));
    }

    private managedOutcomeOwnership(
        result: import("pokie").ArtifactBuildResult,
        plan: ArtifactConversionPlan,
    ): readonly import("pokie").ManagedOutcomeProjectOwnership[] {
        if (result.managedOutcomeProjectOwnership !== undefined) return result.managedOutcomeProjectOwnership;
        // Kept only for injected compatibility registries used by extensions.
        const borrowed = plan.steps.some((step) => step.kind === "reuseManagedOutcomeLibrary");
        const sourceRootPath = plan.source?.canonicalLocation ?? "";
        return Array.from(new Set([...(result.prerequisiteProjectRoots ?? []), ...(result.managedProjectRoots ?? [])])).map((rootPath) => ({
            rootPath,
            sourceRootPath,
            disposition: borrowed ? "borrowed" : "owned",
        }));
    }

    private async parImportRegistrationProvenance(conversionEvidencePath: string | undefined): Promise<{readonly sourceWorkbookPath?: string; readonly conversionEvidencePath?: string} | undefined> {
        if (conversionEvidencePath === undefined) return undefined;
        try {
            const fs = await import("fs");
            const evidence = JSON.parse(await fs.promises.readFile(conversionEvidencePath, "utf8")) as {sourceWorkbook?: unknown};
            return {
                conversionEvidencePath,
                ...(typeof evidence.sourceWorkbook === "string" ? {sourceWorkbookPath: evidence.sourceWorkbook} : {}),
            };
        } catch {
            // The artifact result remains authoritative; registration simply
            // cannot claim provenance it could not inspect.
            return {conversionEvidencePath};
        }
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
    readonly preparedStakeOperation?: PreparedStakeProjectionOperation;
    progress?: StudioArtifactBuildProgressView;
    result?: StudioArtifactBuildView;
};

type PreparedStakeOperationRecord = {
    readonly projectRoot: string;
    readonly operation: PreparedStakeProjectionOperation;
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
