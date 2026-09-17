import fs from "fs";
import path from "path";
import {randomUUID} from "crypto";
import type {ExactEnumerationCheckpoint} from "pokie";
import {createUnresolvedRuntimePlan} from "../artifacts/createExternalArtifactConversionPlan.js";
import type {StudioOutcomeLibraryGenerateResultView} from "./StudioOutcomeLibraryGenerateResultView.js";
import {
    StudioOutcomeLibraryGenerateService,
    type StudioOutcomeLibraryGenerationLifecycleStage,
    type StudioOutcomeLibraryPreflightBinding,
} from "./StudioOutcomeLibraryGenerateService.js";
import type {ValidatedOutcomeLibraryGenerateRequest} from "./validateOutcomeLibraryGenerateRequest.js";
import {StudioJobService} from "../jobs/StudioJobService.js";
import type {StudioJobRecoveryView, StudioJobView} from "../jobs/StudioJobView.js";

export type StudioOutcomeLibraryCheckpointView = {
    readonly id: string;
    readonly processedRawIndex: string;
    readonly progressTotal: string;
    readonly sourceEnumerationId: string;
};

export type StudioOutcomeLibraryGenerateJobResultView = Exclude<StudioOutcomeLibraryGenerateResultView, {status: "cancelled"}> | {
    readonly status: "cancelled";
    readonly processedRawIndex: string;
    readonly progressTotal: string;
    /** Present only for a cancelled exact enumeration. */
    readonly checkpoint?: StudioOutcomeLibraryCheckpointView;
    readonly recovery: string;
    readonly plan: Extract<StudioOutcomeLibraryGenerateResultView, {status: "cancelled"}>["plan"];
};

/** A bounded, JSON-safe record of one Outcome Library publish. */
export type StudioOutcomeLibraryGenerateJobView = {
    readonly id: string;
    readonly status: "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled" | "recovery-required";
    readonly cancellationRequested: boolean;
    readonly lifecycleStage?: StudioOutcomeLibraryGenerationLifecycleStage;
    readonly progress?: {readonly processedRawIndex: string; readonly progressTotal: string; readonly emittedOutcomes?: string};
    readonly result?: StudioOutcomeLibraryGenerateJobResultView;
    readonly recovery?: StudioJobRecoveryView;
};

type JobRecord = {
    readonly id: string;
    readonly projectRoot: string;
    readonly request: ValidatedOutcomeLibraryGenerateRequest;
    readonly controller: AbortController;
    status: StudioOutcomeLibraryGenerateJobView["status"];
    cancellationRequested: boolean;
    lifecycleStage?: StudioOutcomeLibraryGenerationLifecycleStage;
    progress?: {processedRawIndex: string; progressTotal: string; emittedOutcomes?: string};
    result?: StudioOutcomeLibraryGenerateJobResultView;
    /** Resolves only after generation has reached its cleanup-safe terminal state. */
    completion: Promise<void>;
    readonly destinationKey: string;
};

type PersistedCheckpoint = {
    readonly request: PersistedRequest;
    /** The original prepared source/configuration/destination identity. */
    readonly binding: PersistedRequestBinding;
    readonly checkpoint: {
        readonly processedRawIndex: string;
        readonly progressTotal: string;
        readonly sourceEnumerationId: string;
        readonly grids: readonly {readonly key: string; readonly grid: string[][]; readonly weight: string}[];
        readonly recoveryAuthorityId?: string;
    };
};

type PersistedRequestBinding = StudioOutcomeLibraryPreflightBinding & {readonly requestIdentity: string};

type PersistedRequest = Omit<ValidatedOutcomeLibraryGenerateRequest, "maxOutcomeSpaceSize" | "sample" | "resumeFrom" | "signal" | "onProgress"> & {
    readonly maxOutcomeSpaceSize?: string;
    readonly sample?: {readonly sampleSize: string; readonly seed: string};
};

// Job ownership lives at the Studio boundary. The generator still owns cooperative cancellation and
// publication; this class only makes its state pollable and persists an exact checkpoint outside the
// atomically-replaced bundle destination.
export class StudioOutcomeLibraryGenerateJobService {
    private readonly jobs = new Map<string, JobRecord>();
    /** One atomic bundle writer owns a resolved destination at a time. */
    private readonly activeDestinationOwners = new Map<string, string>();
    private readonly generateService: StudioOutcomeLibraryGenerateService;
    private jobService: StudioJobService | undefined;

    constructor(generateService: StudioOutcomeLibraryGenerateService) {
        this.generateService = generateService;
    }

    public attachJobService(jobService: StudioJobService): void {
        this.jobService = jobService;
    }

    public start(projectRoot: string, request: ValidatedOutcomeLibraryGenerateRequest, resumedId?: string): StudioOutcomeLibraryGenerateJobView {
        const wasmDiagnostic = this.generateService.wasmBoundaryDiagnostic?.(projectRoot);
        if (wasmDiagnostic !== undefined) throw new Error(wasmDiagnostic);
        this.trimTerminalJobs();
        const destinationKey = this.destinationKey(projectRoot, request);
        const preflightBinding = this.generateService.getPreflightBinding?.(request.preflightToken);
        const id = resumedId ?? randomUUID();
        const common = this.jobService?.adopt(id, {
            projectId: projectRoot,
            operation: "outcome-library-generation",
            request: durableRequestIdentity(request, preflightBinding, destinationKey),
            conflictKey: `outcome-library:${destinationKey}`,
            // An interrupted executor has not produced a checkpoint yet.  Do
            // not advertise resume merely because this operation *could* be
            // exact: restart reconciliation must guide it to a safe retry.
            recoveryOnRestart: {action: "retry", reason: "Studio restarted before an exact Outcome Library checkpoint was validated. Retry the captured generation from scratch."},
        });
        if (common?.status === "reattached") {
            const existing = this.jobs.get(common.job.id);
            return existing?.projectRoot === projectRoot ? this.toView(existing) : this.projectDurableJob(common.job);
        }
        if (common?.status === "conflict") throw new Error(common.reason);
        if (this.activeDestinationOwners.has(destinationKey)) {
            // Direct, legacy callers may not have attached a JobService. Keep
            // their established destination guard without bypassing durable
            // exact-retry reattachment when the common service is present.
            if (common?.status === "created") this.jobService?.cancelled(common.job.id, {summary: "Outcome Library generation was already active in its compatibility executor."});
            throw new Error("An Outcome Library generation is already active for this destination.");
        }
        const record: JobRecord = {
            // UUIDs make checkpoints safely discoverable across a server restart without
            // reusing the old process-local 1, 2, … namespace.
            id, projectRoot, request: {...request, recoveryAuthorityId: id}, controller: new AbortController(), status: "queued", cancellationRequested: false, lifecycleStage: "generation",
            destinationKey,
            // Assigned below after the record exists for run() to update.
            completion: Promise.resolve(),
        };
        this.jobs.set(record.id, record);
        this.activeDestinationOwners.set(destinationKey, record.id);
        record.completion = new Promise<void>((resolve) => {
            queueMicrotask(resolve);
        }).then(() => this.run(record)).catch((error: unknown) => {
            // generate() normally converts domain failures into its result union. Keep an unexpected
            // adapter failure observable as a terminal job instead of an unhandled server rejection.
            Object.assign(record, {
                status: "failed" as const,
                result: {
                    status: "generation-error" as const,
                    code: "studio-outcome-library-job-failed",
                    error: error instanceof Error ? error.message : String(error),
                    plan: createUnresolvedRuntimePlan(record.projectRoot, "outcomeLibrary"),
                },
            });
            this.jobService?.fail(record.id, error instanceof Error ? error.message : String(error), {action: "retry", reason: "Correct the reported generation problem and run it again."});
        }).finally(() => {
            // Generation owns staging/partial-output cleanup and only resolves once that is
            // complete. Release the destination after that terminal boundary, never on abort.
            if (this.activeDestinationOwners.get(destinationKey) === record.id) {
                this.activeDestinationOwners.delete(destinationKey);
            }
        });
        return this.toView(record);
    }

    public isDestinationActive(projectRoot: string, destination: string): boolean {
        return this.activeDestinationOwners.has(path.resolve(projectRoot, destination));
    }

    public getStatusForProject(projectRoot: string, id: string): StudioOutcomeLibraryGenerateJobView | undefined {
        const record = this.jobs.get(id);
        if (record?.projectRoot === projectRoot) return this.toView(record);
        const persisted = this.readCheckpoint(projectRoot, id);
        if (persisted !== undefined) return this.toView(this.restoreCancelledRecord(projectRoot, id, persisted));
        const common = this.jobService?.get(projectRoot, id);
        return common?.operation === "outcome-library-generation" ? this.projectDurableJob(common) : undefined;
    }

    /** Includes persisted cancellation checkpoints, so a fresh Studio process can offer recovery. */
    public listForProject(projectRoot: string): readonly StudioOutcomeLibraryGenerateJobView[] {
        const visible = new Map<string, StudioOutcomeLibraryGenerateJobView>();
        for (const record of this.jobs.values()) {
            if (record.projectRoot === projectRoot) visible.set(record.id, this.toView(record));
        }
        for (const job of this.jobService?.list(projectRoot) ?? []) {
            if (job.operation === "outcome-library-generation" && !visible.has(job.id)) visible.set(job.id, this.projectDurableJob(job));
        }
        const directory = path.dirname(this.checkpointPath(projectRoot, "placeholder"));
        try {
            for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
                if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
                const id = entry.name.slice(0, -5);
                // A checkpoint is the richer compatibility projection after
                // restart: it carries the only resumable cursor. It must
                // replace the generic common recovery record, never be
                // hidden merely because that durable record was listed first.
                if (!visible.has(id) || !this.jobs.has(id)) {
                    const persisted = this.readCheckpoint(projectRoot, id);
                    if (persisted !== undefined) visible.set(id, this.toView(this.restoreCancelledRecord(projectRoot, id, persisted)));
                }
            }
        } catch {
            // No checkpoint directory is the normal state before a cancellation.
        }
        return Array.from(visible.values());
    }

    public cancelForProject(projectRoot: string, id: string): StudioOutcomeLibraryGenerateJobView | undefined {
        const record = this.jobs.get(id);
        if (record === undefined || record.projectRoot !== projectRoot) {
            const common = this.jobService?.cancel(projectRoot, id);
            return common?.operation === "outcome-library-generation" ? this.projectDurableJob(common) : undefined;
        }
        if (record.status === "queued" || record.status === "running") {
            this.jobService?.cancel(projectRoot, id);
            record.cancellationRequested = true;
            record.controller.abort();
        }
        return this.toView(record);
    }

    /** Abort every active job before Studio loses the HTTP surface that owns it. */
    public async cancelAll(): Promise<void> {
        const active: JobRecord[] = [];
        for (const record of this.jobs.values()) {
            if (record.status === "queued" || record.status === "running") {
                this.jobService?.cancel(record.projectRoot, record.id);
                record.cancellationRequested = true;
                record.controller.abort();
                active.push(record);
            }
        }
        await Promise.all(active.map((record) => record.completion));
    }

    /** Abort active work for a project which Studio is about to leave. */
    public async cancelActiveForProject(projectRoot: string): Promise<void> {
        const active: JobRecord[] = [];
        for (const record of this.jobs.values()) {
            if (record.projectRoot === projectRoot && (record.status === "queued" || record.status === "running")) {
                this.jobService?.cancel(projectRoot, record.id);
                record.cancellationRequested = true;
                record.controller.abort();
                active.push(record);
            }
        }
        await Promise.all(active.map((record) => record.completion));
    }

    public async resumeForProject(projectRoot: string, id: string): Promise<StudioOutcomeLibraryGenerateJobView | undefined> {
        const wasmDiagnostic = this.generateService.wasmBoundaryDiagnostic?.(projectRoot);
        if (wasmDiagnostic !== undefined) throw new Error(wasmDiagnostic);
        const persisted = this.readCheckpoint(projectRoot, id);
        if (persisted === undefined) {
            // A recovery action is never silently downgraded to an absent
            // job: after restart, a missing or corrupt persisted record must
            // leave the destination untouched and tell the caller to retry.
            return this.restoreRejectedResume(
                projectRoot,
                id,
                {recoveryAuthorityId: id},
                "The persisted Outcome Library checkpoint is missing or corrupt. No recovery state was consumed; start a new generation.",
            );
        }
        const request = fromPersistedRequest(persisted.request);
        if (requestIdentity(request) !== persisted.binding.requestIdentity) return this.restoreRejectedResume(projectRoot, id, request, "The persisted checkpoint request identity is invalid.");
        // A restarted server has no process-local token map. Re-preflight the
        // immutable request, compare its source/configuration/destination
        // snapshot, then pass the fresh token through normal generation.
        const rebound = await this.generateService.rebindCheckpointRequest(projectRoot, request, persisted.binding);
        if ("result" in rebound) return this.restoreRejectedResume(projectRoot, id, request, rebound.result.error, rebound.result.plan);
        if (this.isDestinationActive(projectRoot, rebound.request.outDir ?? StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR)) {
            return this.restoreRejectedResume(projectRoot, id, request, "An Outcome Library generation is already active for this resolved destination. Wait for it to finish or cancel it before resuming.");
        }
        // Reuse the checkpoint identity. A successful resumed publication removes
        // this original file, avoiding an orphan which could be resumed later.
        return this.start(projectRoot, {...rebound.request, resumeFrom: fromPersistedCheckpoint(persisted.checkpoint)}, id);
    }

    private async run(record: JobRecord): Promise<void> {
        record.status = "running";
        this.jobService?.markRunning(record.id);
        this.jobService?.progress(record.id, {stage: "preparing", unit: "raw combinations", current: "0", total: "0"});
        const result = await this.generateService.generate(record.projectRoot, {
            ...record.request,
            signal: record.controller.signal,
            onProgress: (processedRawIndex, progressTotal) => {
                record.progress = {processedRawIndex: processedRawIndex.toString(), progressTotal: progressTotal.toString()};
                this.jobService?.progress(record.id, {stage: record.lifecycleStage ?? "generation", unit: "raw combinations", current: processedRawIndex.toString(), total: progressTotal.toString()});
            },
        }, (stage) => {
            record.lifecycleStage = stage;
            this.jobService?.progress(record.id, {stage, unit: "raw combinations", current: record.progress?.processedRawIndex ?? "0", total: record.progress?.progressTotal ?? "0"});
        }, (emittedOutcomes) => {
            if (record.progress !== undefined) record.progress.emittedOutcomes = emittedOutcomes.toString();
            else record.progress = {processedRawIndex: "0", progressTotal: "0", emittedOutcomes: emittedOutcomes.toString()};
            this.jobService?.progress(record.id, {stage: record.lifecycleStage ?? "generation", unit: "emitted outcomes", current: emittedOutcomes.toString(), total: record.progress.progressTotal});
        });
        if (result.status === "cancelled") {
            const cancelledResult: StudioOutcomeLibraryGenerateJobResultView = {
                status: "cancelled",
                processedRawIndex: result.processedRawIndex.toString(),
                progressTotal: result.progressTotal.toString(),
                recovery: result.recovery,
                plan: result.plan,
                ...(result.checkpoint === undefined ? {} : {
                    checkpoint: this.persistCheckpoint(record.projectRoot, record.id, record.request, result.checkpoint),
                }),
            };
            Object.assign(record, {result: cancelledResult, status: "cancelled" as const});
            this.jobService?.cancelled(record.id, {
                summary: "Outcome Library generation cancelled before publication.",
                // The checkpoint file remains the recovery authority, but the
                // operation-specific terminal DTO belongs in the common
                // durable job as well. A restarted compatibility route can
                // then render the cursor, plan, and checkpoint reference
                // without depending on this process-local record.
                detail: {status: cancelledResult.status, result: cancelledResult},
            }, {
                action: cancelledResult.checkpoint === undefined ? "retry" : "resume",
                reason: cancelledResult.checkpoint === undefined
                    ? cancelledResult.recovery
                    : "Resume is available only after Studio revalidates this exact checkpoint against its original source, configuration, and destination.",
            });
            return;
        }
        Object.assign(record, {result, status: result.status === "ok" ? "completed" as const : "failed" as const});
        if (result.status === "ok") {
            this.jobService?.complete(record.id, {
                summary: "Outcome Library generation completed.",
                outputs: [{path: result.bundleDir, label: "Outcome Library bundle"}],
                // Preserve the operation-specific result in the single
                // durable authority.  The old in-process record can then be
                // discarded without making a retained terminal job opaque.
                detail: {status: result.status, result},
            });
        } else {
            const message = "error" in result ? result.error : "Outcome Library generation failed validation.";
            this.jobService?.fail(record.id, message, {action: "retry", reason: "Correct the reported generation problem and run it again."});
        }
        if (result.status === "ok") this.removeCheckpoint(record.projectRoot, record.id);
    }

    private toView(record: JobRecord): StudioOutcomeLibraryGenerateJobView {
        const common = this.jobService?.get(record.projectRoot, record.id);
        return {
            id: record.id,
            status: common?.operation === "outcome-library-generation" ? common.status : record.status,
            cancellationRequested: record.cancellationRequested || common?.status === "cancelling",
            ...(record.lifecycleStage === undefined ? {} : {lifecycleStage: record.lifecycleStage}),
            ...(record.progress === undefined ? {} : {progress: record.progress}),
            ...(record.result === undefined ? {} : {result: record.result}),
            ...(common?.recovery === undefined ? {} : {recovery: common.recovery}),
        };
    }

    private projectDurableJob(job: StudioJobView): StudioOutcomeLibraryGenerateJobView {
        const checkpoint = job.recovery?.action === "resume" ? this.readCheckpoint(job.projectId, job.id) : undefined;
        const recovery = job.recovery?.action === "resume" && checkpoint === undefined
            ? {action: "retry" as const, reason: "The persisted Outcome Library checkpoint is missing or corrupt. Retry the captured generation from scratch."}
            : job.recovery;
        return {
            id: job.id,
            status: job.status,
            cancellationRequested: job.status === "cancelling",
            ...(outcomeLibraryResultFromDurableJob(job) === undefined ? {} : {result: outcomeLibraryResultFromDurableJob(job)}),
            ...(recovery === undefined ? {} : {recovery}),
        };
    }

    private checkpointPath(projectRoot: string, id: string): string {
        // Studio registers a managed Blueprint by its canonical JSON file,
        // while package projects are directories. Checkpoints belong beside
        // the managed project in both cases; appending ".pokie" to the
        // Blueprint file itself turns a successful publication into ENOTDIR
        // during terminal cleanup and falsely reports the job as failed.
        return path.join(this.projectStateRoot(projectRoot), ".pokie", "outcome-library-checkpoints", `${id}.json`);
    }

    private projectStateRoot(projectRoot: string): string {
        try {
            return fs.statSync(projectRoot).isFile() ? path.dirname(projectRoot) : projectRoot;
        } catch {
            // Keep the prior path spelling for a missing project so the
            // normal generation/preflight diagnostics remain authoritative.
            return projectRoot;
        }
    }

    private persistCheckpoint(projectRoot: string, id: string, request: ValidatedOutcomeLibraryGenerateRequest, checkpoint: ExactEnumerationCheckpoint): StudioOutcomeLibraryCheckpointView | undefined {
        const preflightBinding = this.generateService.getPreflightBinding?.(request.preflightToken);
        // Sampled/bounded jobs and unbound direct calls have no durable exact
        // recovery authority.  A generator result alone is not sufficient to
        // make one resumable after process restart.
        if (!isResumableExactRequest(request, preflightBinding) || !isExactCheckpoint(checkpoint)) return undefined;
        const filePath = this.checkpointPath(projectRoot, id);
        fs.mkdirSync(path.dirname(filePath), {recursive: true});
        // Keep the in-process service seam usable for direct callers that do
        // not expose Studio preflight state; HTTP jobs always provide it.
        const stored: PersistedCheckpoint = {
            request: toPersistedRequest(request),
            binding: {
                requestIdentity: requestIdentity(request),
                requestKey: preflightBinding.requestKey,
                gameId: preflightBinding.gameId,
                gameVersion: preflightBinding.gameVersion,
                ...(preflightBinding.configHash === undefined ? {} : {configHash: preflightBinding.configHash}),
                destination: preflightBinding.destination,
                requiresBounded: preflightBinding.requiresBounded,
            },
            checkpoint: {
                processedRawIndex: checkpoint.processedRawIndex.toString(), progressTotal: checkpoint.progressTotal.toString(), sourceEnumerationId: checkpoint.sourceEnumerationId,
                grids: Array.from(checkpoint.grids, ([key, entry]) => ({key, grid: entry.grid, weight: entry.weight.toString()})),
                // The JobService owns the persisted recovery namespace. An
                // injected/direct generator may omit the capability id, but
                // its checkpoint is still bound to this job rather than a
                // checkpoint-controlled staging selector.
                recoveryAuthorityId: checkpoint.recoveryAuthorityId ?? id,
            },
        };
        fs.writeFileSync(filePath, JSON.stringify(stored), "utf8");
        return {id, processedRawIndex: stored.checkpoint.processedRawIndex, progressTotal: stored.checkpoint.progressTotal, sourceEnumerationId: stored.checkpoint.sourceEnumerationId};
    }

    private readCheckpoint(projectRoot: string, id: string): PersistedCheckpoint | undefined {
        try {
            const persisted = JSON.parse(fs.readFileSync(this.checkpointPath(projectRoot, id), "utf8")) as PersistedCheckpoint;
            // Old/unbound or hand-edited checkpoints must never be resumed into a
            // potentially different project state.
            const checkpoint = persisted.checkpoint as PersistedCheckpoint["checkpoint"] & Record<string, unknown>;
            if (
                checkpoint === undefined ||
                "durableStagingDirectory" in checkpoint ||
                "durableCheckpointId" in checkpoint ||
                (checkpoint.recoveryAuthorityId !== undefined && (typeof checkpoint.recoveryAuthorityId !== "string" || !(/^[0-9a-f-]{36}$/i).test(checkpoint.recoveryAuthorityId)))
            ) return undefined;
            if (
                !isPersistedBinding(persisted.binding) ||
                requestIdentity(fromPersistedRequest(persisted.request)) !== persisted.binding.requestIdentity ||
                checkpoint.recoveryAuthorityId !== id ||
                !isPersistedExactCheckpoint(checkpoint)
            ) return undefined;
            return persisted;
        } catch {
            return undefined;
        }
    }

    private removeCheckpoint(projectRoot: string, id: string): void {
        fs.rmSync(this.checkpointPath(projectRoot, id), {force: true});
    }

    private restoreCancelledRecord(projectRoot: string, id: string, persisted: PersistedCheckpoint): JobRecord {
        const request = fromPersistedRequest(persisted.request);
        const record: JobRecord = {
            id,
            projectRoot,
            request,
            controller: new AbortController(),
            status: "cancelled",
            cancellationRequested: true,
            completion: Promise.resolve(),
            destinationKey: this.destinationKey(projectRoot, request),
            progress: {processedRawIndex: persisted.checkpoint.processedRawIndex, progressTotal: persisted.checkpoint.progressTotal},
            result: {
                status: "cancelled",
                processedRawIndex: persisted.checkpoint.processedRawIndex,
                progressTotal: persisted.checkpoint.progressTotal,
                checkpoint: {id, processedRawIndex: persisted.checkpoint.processedRawIndex, progressTotal: persisted.checkpoint.progressTotal, sourceEnumerationId: persisted.checkpoint.sourceEnumerationId},
                recovery: "Generation was cancelled before publication. Resume this exact checkpoint while the loaded game configuration is unchanged.",
                plan: createUnresolvedRuntimePlan(projectRoot, "outcomeLibrary"),
            },
        };
        this.jobs.set(id, record);
        return record;
    }

    private restoreRejectedResume(projectRoot: string, id: string, request: ValidatedOutcomeLibraryGenerateRequest, error: string, plan = createUnresolvedRuntimePlan(projectRoot, "outcomeLibrary")): StudioOutcomeLibraryGenerateJobView {
        this.jobService?.setRecovery(id, {action: "retry", reason: error});
        const record: JobRecord = {
            id, projectRoot, request, controller: new AbortController(), status: "failed", cancellationRequested: false,
            completion: Promise.resolve(), destinationKey: this.destinationKey(projectRoot, request),
            result: {status: "conflict", error, plan},
        };
        this.jobs.set(id, record);
        return this.toView(record);
    }

    private trimTerminalJobs(): void {
        const terminal = Array.from(this.jobs.values()).filter((job) => job.status !== "queued" && job.status !== "running");
        while (terminal.length >= 20) {
            const oldest = terminal.shift();
            if (oldest !== undefined) this.jobs.delete(oldest.id);
        }
    }

    private destinationKey(projectRoot: string, request: ValidatedOutcomeLibraryGenerateRequest): string {
        const binding = this.generateService.getPreflightBinding?.(request.preflightToken);
        return path.resolve(projectRoot, binding?.destination ?? request.outDir ?? StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR);
    }
}

function outcomeLibraryResultFromDurableJob(job: StudioJobView): StudioOutcomeLibraryGenerateJobView["result"] | undefined {
    const result = job.result?.detail?.result;
    return typeof result === "object" && result !== null && "status" in result ? result as StudioOutcomeLibraryGenerateJobView["result"] : undefined;
}

function toPersistedRequest(request: ValidatedOutcomeLibraryGenerateRequest): PersistedRequest {
    const {maxOutcomeSpaceSize, sample, resumeFrom: _resumeFrom, signal: _signal, onProgress: _onProgress, ...rest} = request;
    return {...rest, ...(maxOutcomeSpaceSize === undefined ? {} : {maxOutcomeSpaceSize: maxOutcomeSpaceSize.toString()}), ...(sample === undefined ? {} : {sample: {sampleSize: sample.sampleSize.toString(), seed: sample.seed}})};
}

function fromPersistedRequest(request: PersistedRequest): ValidatedOutcomeLibraryGenerateRequest {
    const {maxOutcomeSpaceSize, sample, ...rest} = request;
    return {...rest, ...(maxOutcomeSpaceSize === undefined ? {} : {maxOutcomeSpaceSize: BigInt(maxOutcomeSpaceSize)}), ...(sample === undefined ? {} : {sample: {sampleSize: BigInt(sample.sampleSize), seed: sample.seed}})};
}

function fromPersistedCheckpoint(checkpoint: PersistedCheckpoint["checkpoint"]): ExactEnumerationCheckpoint {
    return {
        processedRawIndex: BigInt(checkpoint.processedRawIndex), progressTotal: BigInt(checkpoint.progressTotal), sourceEnumerationId: checkpoint.sourceEnumerationId,
        grids: new Map(checkpoint.grids.map((entry) => [entry.key, {grid: entry.grid, weight: BigInt(entry.weight)}])),
        ...(checkpoint.recoveryAuthorityId === undefined ? {} : {recoveryAuthorityId: checkpoint.recoveryAuthorityId}),
    };
}

/** Reject malformed durable JSON before bigint/map conversion can consume it. */
function isPersistedExactCheckpoint(checkpoint: PersistedCheckpoint["checkpoint"] & Record<string, unknown>): boolean {
    const fieldsAreValid = (
        typeof checkpoint.processedRawIndex === "string" && (/^[0-9]+$/).test(checkpoint.processedRawIndex) &&
        typeof checkpoint.progressTotal === "string" && (/^[0-9]+$/).test(checkpoint.progressTotal) &&
        typeof checkpoint.sourceEnumerationId === "string" && checkpoint.sourceEnumerationId.length > 0 &&
        Array.isArray(checkpoint.grids) &&
        checkpoint.grids.every((entry) =>
            entry !== null && typeof entry === "object" &&
            typeof entry.key === "string" && Array.isArray(entry.grid) &&
            entry.grid.every((row) => Array.isArray(row) && row.every((symbol) => typeof symbol === "string")) &&
            typeof entry.weight === "string" && (/^[0-9]+$/).test(entry.weight),
        )
    );
    if (!fieldsAreValid) return false;
    return BigInt(checkpoint.progressTotal) > BigInt(0)
        && BigInt(checkpoint.processedRawIndex) <= BigInt(checkpoint.progressTotal)
        && new Set(checkpoint.grids.map((entry) => entry.key)).size === checkpoint.grids.length;
}

function requestIdentity(request: ValidatedOutcomeLibraryGenerateRequest): string {
    return JSON.stringify({
        mode: request.mode, stake: request.stake, configHash: request.configHash, libraryId: request.libraryId,
        maxOutcomeSpaceSize: request.maxOutcomeSpaceSize?.toString(), generation: request.generation,
        sample: request.sample === undefined ? undefined : {sampleSize: request.sample.sampleSize.toString(), seed: request.sample.seed},
        outDir: request.outDir,
    });
}

function durableRequestIdentity(
    request: ValidatedOutcomeLibraryGenerateRequest,
    binding: StudioOutcomeLibraryPreflightBinding | undefined,
    destination: string,
): Readonly<Record<string, unknown>> {
    return {
        mode: request.mode,
        stake: request.stake,
        configHash: request.configHash,
        libraryId: request.libraryId,
        maxOutcomeSpaceSize: request.maxOutcomeSpaceSize?.toString(),
        generation: request.generation,
        sample: request.sample === undefined ? undefined : {sampleSize: request.sample.sampleSize.toString(), seed: request.sample.seed},
        outDir: request.outDir,
        destination,
        preflight: binding === undefined ? undefined : {
            requestKey: binding.requestKey,
            gameId: binding.gameId,
            gameVersion: binding.gameVersion,
            configHash: binding.configHash,
            destination: binding.destination,
            requiresBounded: binding.requiresBounded,
        },
    };
}

function isResumableExactRequest(
    request: ValidatedOutcomeLibraryGenerateRequest,
    binding: StudioOutcomeLibraryPreflightBinding | undefined,
): binding is StudioOutcomeLibraryPreflightBinding {
    return binding !== undefined && binding.requiresBounded === false && (request.generation === "default" || request.generation === "exact");
}

function isExactCheckpoint(checkpoint: ExactEnumerationCheckpoint): boolean {
    return checkpoint.processedRawIndex >= BigInt(0)
        && checkpoint.processedRawIndex <= checkpoint.progressTotal
        && checkpoint.progressTotal > BigInt(0)
        && checkpoint.sourceEnumerationId.length > 0;
}

function isPersistedBinding(binding: unknown): binding is PersistedRequestBinding {
    if (typeof binding !== "object" || binding === null) return false;
    const candidate = binding as Partial<PersistedRequestBinding>;
    return typeof candidate.requestIdentity === "string"
        && typeof candidate.requestKey === "string"
        && typeof candidate.gameId === "string" && candidate.gameId.length > 0
        && typeof candidate.gameVersion === "string" && candidate.gameVersion.length > 0
        && (candidate.configHash === undefined || typeof candidate.configHash === "string")
        && typeof candidate.destination === "string" && candidate.destination.length > 0
        && typeof candidate.requiresBounded === "boolean";
}
