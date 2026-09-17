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

/**
 * The narrow boundary between a Studio HTTP action and its established domain
 * executor.  It deliberately carries no domain result type: executors keep
 * their public contracts while Studio owns scheduling and durable lifecycle.
 */
export type StudioJobExecutorContext = {
    readonly job: StudioJobView;
    readonly signal: AbortSignal;
    progress(progress: StudioJobProgressView): StudioJobView | undefined;
};

export type StudioJobExecutorTerminal =
    | {readonly status: "completed"; readonly result: StudioJobResultView}
    | {readonly status: "failed"; readonly error: string; readonly recovery?: StudioJobRecoveryView}
    | {readonly status: "cancelled"; readonly result?: StudioJobResultView; readonly recovery?: StudioJobRecoveryView};

export type StudioJobExecutionResult<T> =
    | Exclude<StudioJobStartResult, {status: "created"}>
    | {readonly status: "executed"; readonly job: StudioJobView; readonly value: T};

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
        return this.transition(id, (job) => job.status === "cancelling" || isStudioJobTerminal(job.status)
            ? job
            : {...job, status: "running", startedAt: job.startedAt ?? this.now()});
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

    /**
     * Refines a retained recovery decision after an operation-specific
     * checkpoint has been inspected.  Terminal outcome remains immutable;
     * only its next safe user action may become more conservative.
     */
    public setRecovery(id: string, recovery: StudioJobRecoveryView): StudioJobView | undefined {
        return this.transition(id, (job) => ({...job, recovery}));
    }

    /**
     * Runs one compatibility executor behind the common durable job record.
     * Reattachment/conflict is resolved before `executor` is called, and the
     * retained AbortController is released only after its terminal state has
     * been persisted.  The executor's own result type is returned unchanged.
     */
    public async execute<T>(
        input: StudioJobStartInput,
        executor: (context: StudioJobExecutorContext) => Promise<T>,
        terminalForResult: (value: T, cancelled: boolean) => StudioJobExecutorTerminal,
        terminalForException: (error: unknown, cancelled: boolean) => StudioJobExecutorTerminal = (error, cancelled) => cancelled
            ? {status: "cancelled", result: {summary: "Studio job cancelled after executor cleanup."}}
            : {status: "failed", error: error instanceof Error ? error.message : String(error)},
    ): Promise<StudioJobExecutionResult<T>> {
        const started = this.start(input);
        if (started.status !== "created") return started;

        const job = this.markRunning(started.job.id) ?? started.job;
        const signal = this.signal(job.id);
        if (signal === undefined) throw new Error(`Studio job "${job.id}" has no cancellation handle.`);
        const context: StudioJobExecutorContext = {job, signal, progress: (progress) => this.progress(job.id, progress)};
        try {
            const value = await executor(context);
            // A domain executor may have supplied finer-grained snapshots while it
            // worked.  Once it returns, though, the only truthful remaining work
            // is committing its terminal record.  Persist that boundary instead
            // of leaving a reconnecting client on a misleading "running" stage.
            this.progress(job.id, {stage: "Finalizing", unit: "work", current: "indeterminate", total: "indeterminate", message: "Persisting the terminal result."});
            this.persistExecutorTerminal(job.id, terminalForResult(value, signal.aborted));
            return {status: "executed", job: this.repository.get(job.id) ?? job, value};
        } catch (error) {
            this.persistExecutorTerminal(job.id, terminalForException(error, signal.aborted));
            throw error;
        }
    }

    /** Cancellation is only a request; executor cleanup calls cancelled(). */
    public cancel(projectId: string, id: string): StudioJobView | undefined {
        const job = this.get(projectId, id);
        if (job === undefined || isStudioJobTerminal(job.status)) return job;
        // Publish the request before notifying the executor. An AbortSignal
        // listener may settle synchronously enough for its async continuation
        // to persist a terminal record before this HTTP handler responds; in
        // that case returning the terminal state falsely says cancellation was
        // already complete, even though the caller has only just requested
        // cleanup. The durable cancelling transition is therefore the visible
        // hand-off boundary, and executor cleanup owns the terminal state.
        const cancelling = this.transition(id, (current) => ({...current, status: "cancelling"}));
        this.executions.get(id)?.controller.abort();
        return cancelling;
    }

    /**
     * Requests cancellation for every executor this Studio process still owns.
     * This is deliberately process-scoped rather than project-scoped: shutdown
     * can occur while Home is materializing a different project, so consulting
     * only the current dashboard would strand that operation in a false
     * running state until the next restart reconciliation.
     */
    public cancelAll(): readonly StudioJobView[] {
        const requested: StudioJobView[] = [];
        for (const job of this.repository.list()) {
            if (isStudioJobTerminal(job.status) || !this.executions.has(job.id)) continue;
            const cancelled = this.cancel(job.projectId, job.id);
            if (cancelled !== undefined) requested.push(cancelled);
        }
        return requested;
    }

    public reconcileInterruptedJobs(): void {
        for (const job of this.repository.list()) {
            if (isStudioJobTerminal(job.status)) continue;
            const recovery: StudioJobRecoveryView = job.recoveryOnRestart ?? {action: "retry", reason: "Studio restarted before this job completed. No partial output was published; retry from scratch."};
            this.terminal(job.id, "recovery-required", {recovery});
        }
    }

    private terminal(id: string, status: Extract<StudioJobView["status"], "completed" | "failed" | "cancelled" | "recovery-required">, fields: Partial<StudioJobView>): StudioJobView | undefined {
        const current = this.repository.get(id);
        if (current === undefined || isStudioJobTerminal(current.status)) return current;
        const completedAt = this.now();
        const result = this.transition(id, (job) => ({...job, ...fields, status, completedAt, durationMs: Math.max(0, completedAt - (job.startedAt ?? job.createdAt))}));
        this.executions.delete(id);
        return result;
    }
    private persistExecutorTerminal(id: string, terminal: StudioJobExecutorTerminal): StudioJobView | undefined {
        if (terminal.status === "completed") return this.complete(id, terminal.result);
        if (terminal.status === "failed") return this.fail(id, terminal.error, terminal.recovery);
        return this.cancelled(id, terminal.result, terminal.recovery);
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
