import fs from "fs";
import path from "path";
import type {ExactEnumerationCheckpoint} from "pokie";
import type {StudioOutcomeLibraryGenerateResultView} from "./StudioOutcomeLibraryGenerateResultView.js";
import {StudioOutcomeLibraryGenerateService} from "./StudioOutcomeLibraryGenerateService.js";
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
    readonly checkpoint: StudioOutcomeLibraryCheckpointView;
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
};

type PersistedCheckpoint = {
    readonly request: PersistedRequest;
    readonly checkpoint: {
        readonly processedRawIndex: string;
        readonly progressTotal: string;
        readonly sourceEnumerationId: string;
        readonly grids: readonly {readonly key: string; readonly grid: string[][]; readonly weight: string}[];
    };
};

type PersistedRequest = Omit<ValidatedOutcomeLibraryGenerateRequest, "maxOutcomeSpaceSize" | "sample" | "resumeFrom" | "signal" | "onProgress"> & {
    readonly maxOutcomeSpaceSize?: string;
    readonly sample?: {readonly sampleSize: string; readonly seed: string};
};

// Job ownership lives at the Studio boundary. The generator still owns cooperative cancellation and
// publication; this class only makes its state pollable and persists an exact checkpoint outside the
// atomically-replaced bundle destination.
export class StudioOutcomeLibraryGenerateJobService {
    private readonly jobs = new Map<string, JobRecord>();
    private nextId = 1;
    private readonly generateService: StudioOutcomeLibraryGenerateService;

    constructor(generateService: StudioOutcomeLibraryGenerateService) {
        this.generateService = generateService;
    }

    public start(projectRoot: string, request: ValidatedOutcomeLibraryGenerateRequest): StudioOutcomeLibraryGenerateJobView {
        this.trimTerminalJobs();
        const record: JobRecord = {
            id: String(this.nextId++), projectRoot, request, controller: new AbortController(), status: "queued", cancellationRequested: false,
        };
        this.jobs.set(record.id, record);
        queueMicrotask(() => {
            this.run(record).catch(() => {
                // generate() normally converts domain failures into its result union. Keep an unexpected
                // adapter failure observable as a terminal job instead of an unhandled server rejection.
                Object.assign(record, {status: "failed" as const});
            });
        });
        return this.toView(record);
    }

    public getStatusForProject(projectRoot: string, id: string): StudioOutcomeLibraryGenerateJobView | undefined {
        const record = this.jobs.get(id);
        return record?.projectRoot === projectRoot ? this.toView(record) : undefined;
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

    public resumeForProject(projectRoot: string, id: string): StudioOutcomeLibraryGenerateJobView | undefined {
        const record = this.jobs.get(id);
        const persisted = record?.projectRoot === projectRoot && record.result?.status === "cancelled"
            ? this.readCheckpoint(projectRoot, id)
            : this.readCheckpoint(projectRoot, id);
        if (persisted === undefined) return undefined;
        return this.start(projectRoot, {...fromPersistedRequest(persisted.request), resumeFrom: fromPersistedCheckpoint(persisted.checkpoint)});
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
            const checkpoint = this.persistCheckpoint(record.projectRoot, record.id, record.request, result.checkpoint);
            record.result = {
                ...result,
                processedRawIndex: result.processedRawIndex.toString(),
                progressTotal: result.progressTotal.toString(),
                checkpoint,
            };
            record.status = "cancelled";
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
        const stored: PersistedCheckpoint = {
            request: toPersistedRequest(request),
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
            return JSON.parse(fs.readFileSync(this.checkpointPath(projectRoot, id), "utf8")) as PersistedCheckpoint;
        } catch {
            return undefined;
        }
    }

    private removeCheckpoint(projectRoot: string, id: string): void {
        fs.rmSync(this.checkpointPath(projectRoot, id), {force: true});
    }

    private trimTerminalJobs(): void {
        const terminal = Array.from(this.jobs.values()).filter((job) => job.status !== "queued" && job.status !== "running");
        while (terminal.length >= 20) {
            const oldest = terminal.shift();
            if (oldest !== undefined) this.jobs.delete(oldest.id);
        }
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
