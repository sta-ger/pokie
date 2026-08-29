import fs from "fs";
import path from "path";
import {randomUUID} from "crypto";
import type {ExactEnumerationCheckpoint} from "pokie";
import {createUnresolvedRuntimePlan} from "../artifacts/createExternalArtifactConversionPlan.js";
import type {StudioOutcomeLibraryGenerateResultView} from "./StudioOutcomeLibraryGenerateResultView.js";
import {StudioOutcomeLibraryGenerateService, type StudioOutcomeLibraryPreflightBinding} from "./StudioOutcomeLibraryGenerateService.js";
import type {ValidatedOutcomeLibraryGenerateRequest} from "./validateOutcomeLibraryGenerateRequest.js";

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
    readonly status: "queued" | "running" | "completed" | "failed" | "cancelled";
    readonly cancellationRequested: boolean;
    readonly progress?: {readonly processedRawIndex: string; readonly progressTotal: string};
    readonly result?: StudioOutcomeLibraryGenerateJobResultView;
};

type JobRecord = {
    readonly id: string;
    readonly projectRoot: string;
    readonly request: ValidatedOutcomeLibraryGenerateRequest;
    readonly controller: AbortController;
    status: StudioOutcomeLibraryGenerateJobView["status"];
    cancellationRequested: boolean;
    progress?: {processedRawIndex: string; progressTotal: string};
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

    constructor(generateService: StudioOutcomeLibraryGenerateService) {
        this.generateService = generateService;
    }

    public start(projectRoot: string, request: ValidatedOutcomeLibraryGenerateRequest, resumedId?: string): StudioOutcomeLibraryGenerateJobView {
        this.trimTerminalJobs();
        const destinationKey = this.destinationKey(projectRoot, request);
        if (this.activeDestinationOwners.has(destinationKey)) {
            throw new Error("An Outcome Library generation is already active for this destination.");
        }
        const record: JobRecord = {
            // UUIDs make checkpoints safely discoverable across a server restart without
            // reusing the old process-local 1, 2, … namespace.
            id: resumedId ?? randomUUID(), projectRoot, request, controller: new AbortController(), status: "queued", cancellationRequested: false,
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
        if (persisted === undefined) return undefined;
        return this.toView(this.restoreCancelledRecord(projectRoot, id, persisted));
    }

    /** Includes persisted cancellation checkpoints, so a fresh Studio process can offer recovery. */
    public listForProject(projectRoot: string): readonly StudioOutcomeLibraryGenerateJobView[] {
        const visible = new Map<string, StudioOutcomeLibraryGenerateJobView>();
        for (const record of this.jobs.values()) {
            if (record.projectRoot === projectRoot) visible.set(record.id, this.toView(record));
        }
        const directory = path.dirname(this.checkpointPath(projectRoot, "placeholder"));
        try {
            for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {
                if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
                const id = entry.name.slice(0, -5);
                if (!visible.has(id)) {
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
        if (record === undefined || record.projectRoot !== projectRoot) return undefined;
        if (record.status === "queued" || record.status === "running") {
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
                record.cancellationRequested = true;
                record.controller.abort();
                active.push(record);
            }
        }
        await Promise.all(active.map((record) => record.completion));
    }

    public async resumeForProject(projectRoot: string, id: string): Promise<StudioOutcomeLibraryGenerateJobView | undefined> {
        const persisted = this.readCheckpoint(projectRoot, id);
        if (persisted === undefined) return undefined;
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
        const result = await this.generateService.generate(record.projectRoot, {
            ...record.request,
            signal: record.controller.signal,
            onProgress: (processedRawIndex, progressTotal) => {
                record.progress = {processedRawIndex: processedRawIndex.toString(), progressTotal: progressTotal.toString()};
            },
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
            return;
        }
        Object.assign(record, {result, status: result.status === "ok" ? "completed" as const : "failed" as const});
        if (result.status === "ok") this.removeCheckpoint(record.projectRoot, record.id);
    }

    private toView(record: JobRecord): StudioOutcomeLibraryGenerateJobView {
        return {id: record.id, status: record.status, cancellationRequested: record.cancellationRequested, ...(record.progress === undefined ? {} : {progress: record.progress}), ...(record.result === undefined ? {} : {result: record.result})};
    }

    private checkpointPath(projectRoot: string, id: string): string {
        return path.join(projectRoot, ".pokie", "outcome-library-checkpoints", `${id}.json`);
    }

    private persistCheckpoint(projectRoot: string, id: string, request: ValidatedOutcomeLibraryGenerateRequest, checkpoint: ExactEnumerationCheckpoint): StudioOutcomeLibraryCheckpointView {
        const filePath = this.checkpointPath(projectRoot, id);
        fs.mkdirSync(path.dirname(filePath), {recursive: true});
        // Keep the in-process service seam usable for direct callers that do
        // not expose Studio preflight state; HTTP jobs always provide it.
        const preflightBinding = this.generateService.getPreflightBinding?.(request.preflightToken);
        const stored: PersistedCheckpoint = {
            request: toPersistedRequest(request),
            binding: {
                requestIdentity: requestIdentity(request),
                requestKey: preflightBinding?.requestKey ?? generationRequestKey(request),
                gameId: preflightBinding?.gameId ?? "",
                gameVersion: preflightBinding?.gameVersion ?? "",
                ...(preflightBinding?.configHash === undefined ? {} : {configHash: preflightBinding.configHash}),
                destination: preflightBinding?.destination ?? request.outDir ?? StudioOutcomeLibraryGenerateService.DEFAULT_BUNDLE_DIR,
                // Only exact jobs produce resumable checkpoints; a direct
                // in-process caller without a token is therefore known to
                // have already passed sampled-opt-in eligibility.
                requiresBounded: preflightBinding?.requiresBounded ?? false,
            },
            checkpoint: {
                processedRawIndex: checkpoint.processedRawIndex.toString(), progressTotal: checkpoint.progressTotal.toString(), sourceEnumerationId: checkpoint.sourceEnumerationId,
                grids: Array.from(checkpoint.grids, ([key, entry]) => ({key, grid: entry.grid, weight: entry.weight.toString()})),
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
            return persisted.binding !== undefined && requestIdentity(fromPersistedRequest(persisted.request)) === persisted.binding.requestIdentity ? persisted : undefined;
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
    };
}

function requestIdentity(request: ValidatedOutcomeLibraryGenerateRequest): string {
    return JSON.stringify({
        mode: request.mode, stake: request.stake, configHash: request.configHash, libraryId: request.libraryId,
        maxOutcomeSpaceSize: request.maxOutcomeSpaceSize?.toString(), generation: request.generation,
        sample: request.sample === undefined ? undefined : {sampleSize: request.sample.sampleSize.toString(), seed: request.sample.seed},
        outDir: request.outDir, preflightToken: request.preflightToken,
    });
}

function generationRequestKey(request: ValidatedOutcomeLibraryGenerateRequest): string {
    return JSON.stringify({
        mode: request.mode, stake: request.stake, configHash: request.configHash, libraryId: request.libraryId,
        outDir: request.outDir, generation: request.generation, maxOutcomeSpaceSize: request.maxOutcomeSpaceSize?.toString(),
        sample: request.sample === undefined ? undefined : {sampleSize: request.sample.sampleSize.toString(), seed: request.sample.seed},
    });
}
