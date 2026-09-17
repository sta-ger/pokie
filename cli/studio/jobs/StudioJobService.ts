import crypto from "crypto";
import type {StudioJobRepository} from "./StudioJobRepository.js";
import {isStudioJobTerminal, type StudioJobProgressView, type StudioJobRecoveryView, type StudioJobResultView, type StudioJobView} from "./StudioJobView.js";

export type StudioJobStartInput = {
    readonly projectId: string;
    readonly operation: string;
    readonly request: Readonly<Record<string, unknown>>;
    readonly conflictKey: string;
    readonly recoveryOnRestart?: StudioJobRecoveryView;
};

export type StudioJobStartResult = {status: "created"; job: StudioJobView} | {status: "reattached"; job: StudioJobView} | {
    status: "conflict";
    activeJobId: string;
    reason: string;
    recovery: StudioJobRecoveryView;
};

type ActiveExecution = {readonly controller: AbortController; readonly recoveryOnRestart: StudioJobRecoveryView};

/** The sole durable lifecycle owner.  Domain services remain executors. */
export class StudioJobService {
    private readonly executions = new Map<string, ActiveExecution>();

    public constructor(
        private readonly repository: StudioJobRepository,
        private readonly now: () => number = Date.now,
        private readonly createId: () => string = () => crypto.randomUUID().replace(/-/g, ""),
    ) {
        this.reconcileInterruptedJobs();
    }

    public list(projectId: string): readonly StudioJobView[] {
        return this.repository.list(projectId);
    }
    public get(projectId: string, id: string): StudioJobView | undefined {
        const job = this.repository.get(id);
        return job?.projectId === projectId ? job : undefined;
    }

    public start(input: StudioJobStartInput): StudioJobStartResult {
        const active = this.repository.list(input.projectId).find((job) => !isStudioJobTerminal(job.status) && job.conflictKey === input.conflictKey);
        if (active !== undefined) {
            if (sameRequest(active.request, input.request)) {
                return {status: "reattached", job: active};
            }
            return {
                status: "conflict",
                activeJobId: active.id,
                reason: `A ${active.operation} job already owns this resource.`,
                recovery: {action: "retry", reason: "Wait for the active job to finish or cancel it before changing this request."},
            };
        }
        const job: StudioJobView = {
            id: this.createId(), projectId: input.projectId, operation: input.operation, request: input.request,
            conflictKey: input.conflictKey, status: "queued", createdAt: this.now(),
            recoveryOnRestart: input.recoveryOnRestart ?? {action: "retry", reason: "Studio restarted before this job reached a safe terminal state. Retry from scratch."},
        };
        this.repository.save(job);
        this.executions.set(job.id, {
            controller: new AbortController(),
            recoveryOnRestart: job.recoveryOnRestart!,
        });
        return {status: "created", job};
    }

    /** Lets a compatibility executor retain its established public job id. */
    public adopt(id: string, input: StudioJobStartInput): StudioJobStartResult {
        const started = this.start(input);
        if (started.status !== "created" || started.job.id === id) {
            return started;
        }
        this.repository.remove(started.job.id);
        const job = {...started.job, id};
        this.repository.save(job);
        this.executions.delete(started.job.id);
        this.executions.set(id, {
            controller: new AbortController(),
            recoveryOnRestart: job.recoveryOnRestart!,
        });
        return {status: "created", job};
    }

    public signal(id: string): AbortSignal | undefined {
        return this.executions.get(id)?.controller.signal;
    }
    public markRunning(id: string): StudioJobView | undefined {
        return this.transition(id, (job) => ({...job, status: "running", startedAt: job.startedAt ?? this.now()}));
    }
    public progress(id: string, progress: StudioJobProgressView): StudioJobView | undefined {
        return this.transition(id, (job) => isStudioJobTerminal(job.status) ? job : {...job, progress});
    }
    public complete(id: string, result: StudioJobResultView): StudioJobView | undefined {
        return this.terminal(id, "completed", {result});
    }
    public fail(id: string, error: string, recovery?: StudioJobRecoveryView): StudioJobView | undefined {
        return this.terminal(id, "failed", {error, ...(recovery === undefined ? {} : {recovery})});
    }
    public cancelled(id: string, result?: StudioJobResultView, recovery?: StudioJobRecoveryView): StudioJobView | undefined {
        return this.terminal(id, "cancelled", {...(result === undefined ? {} : {result}), ...(recovery === undefined ? {} : {recovery})});
    }

    /** Cancellation is only a request; executor cleanup calls cancelled(). */
    public cancel(projectId: string, id: string): StudioJobView | undefined {
        const job = this.get(projectId, id);
        if (job === undefined || isStudioJobTerminal(job.status)) return job;
        this.executions.get(id)?.controller.abort();
        return this.transition(id, (current) => ({...current, status: "cancelling"}));
    }

    public reconcileInterruptedJobs(): void {
        for (const job of this.repository.list()) {
            if (isStudioJobTerminal(job.status)) continue;
            const recovery: StudioJobRecoveryView = job.recoveryOnRestart ?? {action: "retry", reason: "Studio restarted before this job completed. No partial output was published; retry from scratch."};
            this.terminal(job.id, "recovery-required", {recovery});
        }
    }

    private terminal(id: string, status: Extract<StudioJobView["status"], "completed" | "failed" | "cancelled" | "recovery-required">, fields: Partial<StudioJobView>): StudioJobView | undefined {
        const completedAt = this.now();
        const result = this.transition(id, (job) => ({...job, ...fields, status, completedAt, durationMs: Math.max(0, completedAt - (job.startedAt ?? job.createdAt))}));
        this.executions.delete(id);
        return result;
    }
    private transition(id: string, mutate: (job: StudioJobView) => StudioJobView): StudioJobView | undefined {
        const old = this.repository.get(id);
        if (old === undefined) return undefined;
        const next = mutate(old);
        this.repository.save(next);
        return next;
    }
}

function sameRequest(left: Readonly<Record<string, unknown>>, right: Readonly<Record<string, unknown>>): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
}
