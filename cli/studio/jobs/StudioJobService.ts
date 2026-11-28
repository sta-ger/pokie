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
    | {readonly status: "failed"; readonly error: string; readonly recovery?: StudioJobRecoveryView; readonly result?: StudioJobResultView}
    | {readonly status: "recovery-required"; readonly recovery: StudioJobRecoveryView; readonly result?: StudioJobResultView}
    | {readonly status: "cancelled"; readonly result?: StudioJobResultView; readonly recovery?: StudioJobRecoveryView};

export type StudioJobExecutionResult<T> =
    | Exclude<StudioJobStartResult, {status: "created"}>
    | {readonly status: "executed"; readonly job: StudioJobView; readonly value: T};

type ActiveExecution = {readonly controller: AbortController; readonly recoveryOnRestart: StudioJobRecoveryView};

/** The sole durable lifecycle owner.  Domain services remain executors. */
export class StudioJobService {
    private acceptingJobs = true;
    private executorCleanupFailed = false;
    private readonly pendingExecutors = new Set<Promise<void>>();
    private readonly executions = new Map<string, ActiveExecution>();

    public constructor(
        private readonly repository: StudioJobRepository,
        private readonly now: () => number = Date.now,
        private readonly createId: () => string = () => crypto.randomUUID().replace(/-/g, ""),
    ) {
        // The durable job store is shared by every Studio server started by the same user (two
        // browser tabs, a CLI session, concurrent QA runs on different ports). A new server must only
        // recover jobs whose owner process is gone; otherwise starting a second server would mark the
        // first server's live generation as interrupted and show the user a false "Studio restarted"
        // warning while that job is still running or has already published its output.
        this.reconcileInterruptedJobs();
        this.repository.saveProcessState({status: "running", updatedAt: this.now(), pid: process.pid});
    }

    /** Lists every retained job, or only one project when an identity is supplied. */
    public list(projectId?: string): readonly StudioJobView[] {
        return this.repository.list(projectId);
    }
    public get(projectId: string, id: string): StudioJobView | undefined {
        const job = this.repository.get(id);
        return job?.projectId === projectId ? job : undefined;
    }

    /**
     * Remove a terminal job from durable history after the author has reviewed it. Active work is
     * never discarded: it must be cancelled first so its executor can drain safely. Files and build
     * outputs referenced by the job are untouched; this only forgets the Studio job record.
     */
    public dismiss(projectId: string, id: string): boolean {
        const job = this.get(projectId, id);
        if (job === undefined || !isStudioJobTerminal(job.status)) return false;
        this.repository.remove(id);
        return true;
    }

    public start(input: StudioJobStartInput): StudioJobStartResult {
        if (!this.acceptingJobs) throw new Error("Studio is shutting down. Restart Studio before starting another job.");
        // `projectId` identifies the owner used for discovery and access
        // control.  It is deliberately not the locking scope: Design sources
        // and two projects can both address the same publication/delivery
        // resource.  Adapters encode that resource alone in `conflictKey`, so
        // an incompatible owner cannot race a write simply by using a
        // different source identity.
        const active = this.repository.list().find((job) => !isStudioJobTerminal(job.status) && job.conflictKey === input.conflictKey);
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
            conflictKey: input.conflictKey, status: "queued", createdAt: this.now(), ownerPid: process.pid,
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
    public fail(id: string, error: string, recovery?: StudioJobRecoveryView, result?: StudioJobResultView): StudioJobView | undefined {
        return this.terminal(id, "failed", {
            error,
            ...(recovery === undefined ? {} : {recovery}),
            ...(result === undefined ? {} : {result}),
        });
    }
    public cancelled(id: string, result?: StudioJobResultView, recovery?: StudioJobRecoveryView): StudioJobView | undefined {
        return this.terminal(id, "cancelled", {...(result === undefined ? {} : {result}), ...(recovery === undefined ? {} : {recovery})});
    }

    /** A lost external executor cannot attest to drainage. Keep its prefix for recovery. */
    public requireRecovery(id: string, recovery: StudioJobRecoveryView, result?: StudioJobResultView): StudioJobView | undefined {
        this.executorCleanupFailed = true;
        return this.terminal(id, "recovery-required", {recovery, ...(result === undefined ? {} : {result})});
    }

    /** Retain a lost idle owner's cleanup failure even after execution admission closes. */
    public recordCleanupFailure(input: StudioJobStartInput, recovery: StudioJobRecoveryView): StudioJobView {
        this.executorCleanupFailed = true;
        const job: StudioJobView = {id: this.createId(), projectId: input.projectId, operation: input.operation,
            request: input.request, conflictKey: input.conflictKey, status: "recovery-required",
            createdAt: this.now(), completedAt: this.now(), durationMs: 0, ownerPid: process.pid, recovery};
        this.repository.save(job);
        return job;
    }

    /**
     * Refines a retained recovery decision after an operation-specific
     * checkpoint has been inspected.  Terminal outcome remains immutable;
     * only its next safe user action may become more conservative.
     */
    public setRecovery(id: string, recovery: StudioJobRecoveryView): StudioJobView | undefined {
        return this.transition(id, (job) => ({...job, recovery}));
    }

    /** Attach a late accepted Play publication without erasing the lost-owner terminal/warning.
     * The browser service authenticates the admitted owner and current artifact first.
     */
    public retainBrowserPlayPublication(id: string, result: StudioJobResultView): StudioJobView | undefined {
        return this.transition(id, job => job.operation === "browser-play" && job.status === "recovery-required" && !job.result?.detail?.session
            ? {...job, result}
            : job);
    }

    /** Record a consumed optimization preview without changing its mathematical verdict/evidence. */
    public recordOptimizationApply(projectId: string, id: string, outputPath: string, sourceRevision?: string): StudioJobView | undefined {
        return this.transition(id, job => job.projectId === projectId && job.operation === "optimization" && job.status === "completed" && job.result
            ? {...job, result: {...job.result, provenance: {...job.result.provenance, authoredApply: {path: outputPath, ...(sourceRevision === undefined ? {} : {sourceRevision})}}}}
            : job);
    }

    /**
     * Mark a consumed apply as undone. The preview stays consumed (the same candidate cannot be applied
     * again), but reloading Studio must no longer present the source as still changed by it.
     */
    public recordOptimizationUndo(projectId: string, id: string): StudioJobView | undefined {
        return this.transition(id, job => {
            if (job.projectId !== projectId || job.operation !== "optimization" || job.status !== "completed" || !job.result) return job;
            const provenance = {...(job.result.provenance ?? {})};
            Reflect.deleteProperty(provenance, "authoredApply");
            return {...job, result: {...job.result, provenance: {...provenance, authoredUndo: {restoredAt: new Date().toISOString()}}}};
        });
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
            ? {status: "recovery-required", recovery: {action: "retry", reason: `Executor cleanup could not be confirmed after cancellation: ${error instanceof Error ? error.message : String(error)}`}}
            : {status: "failed", error: error instanceof Error ? error.message : String(error)},
    ): Promise<StudioJobExecutionResult<T>> {
        const execution = await this.executeStarted(this.start(input), executor, terminalForResult, terminalForException);
        return execution;
    }

    /** Admit an asynchronous HTTP operation synchronously; the existing executor owner drains it. */
    public launch<T>(input: StudioJobStartInput, executor: (context: StudioJobExecutorContext) => Promise<T>,
        terminalForResult: (value: T, cancelled: boolean) => StudioJobExecutorTerminal): {started: StudioJobStartResult; completion?: Promise<StudioJobExecutionResult<T>>} {
        const started = this.start(input);
        return started.status === "created"
            ? {started, completion: this.executeStarted(started, executor, terminalForResult, (error, cancelled) => cancelled ? {status: "recovery-required", recovery: {action: "retry", reason: `Cleanup could not be confirmed: ${error instanceof Error ? error.message : String(error)}`}} : {status: "failed", error: error instanceof Error ? error.message : String(error)})}
            : {started};
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
            // A second Studio server may own this job; shutdown of this server must not cancel work
            // that another live server is still draining.
            if (job.ownerPid !== undefined && job.ownerPid !== process.pid) continue;
            if (isStudioJobTerminal(job.status) || !this.executions.has(job.id)) continue;
            const cancelled = this.cancel(job.projectId, job.id);
            if (cancelled !== undefined) requested.push(cancelled);
        }
        return requested;
    }

    /** Stop admitting new executors before draining the captured owners. */
    public beginShutdown(): void {
        this.acceptingJobs = false;
        this.cancelAll();
    }

    /** Persist graceful stop only after every executor has reported its cleanup. */
    public async completeGracefulShutdown(cleanupConfirmed = true): Promise<void> {
        await Promise.all([...this.pendingExecutors]);
        // Only this server's unfinished work can block its own graceful-shutdown marker. A different
        // live Studio server may legitimately still own a job in the same shared store.
        const unresolved = this.repository.list().some((job) => !isStudioJobTerminal(job.status) && this.isOwnedByThisProcess(job));
        if (!cleanupConfirmed || this.executorCleanupFailed || unresolved) {
            this.reconcileInterruptedJobs(true);
            throw new Error("Studio shutdown could not confirm executor cleanup. Saved jobs require recovery.");
        }
        this.repository.saveProcessState({status: "gracefully-stopped", updatedAt: this.now(), pid: process.pid});
    }

    public reconcileInterruptedJobs(cleanupUnconfirmed = false): void {
        for (const job of this.repository.list()) {
            if (isStudioJobTerminal(job.status) || this.hasLiveOtherOwner(job)) continue;
            const recovery: StudioJobRecoveryView = job.recoveryOnRestart ?? {action: "retry", reason: "Studio restarted before this job completed. No partial output was published; retry from scratch."};
            this.terminal(job.id, "recovery-required", {recovery: cleanupUnconfirmed
                ? {...recovery, reason: "Studio shutdown could not confirm executor cleanup. Inspect the captured destination and saved files, then restart Studio before retrying."}
                : recovery});
        }
    }

    /** A job written by this process, or a pre-ownerPid record that this process is the only claimant of. */
    private isOwnedByThisProcess(job: StudioJobView): boolean {
        if (job.ownerPid !== undefined) return job.ownerPid === process.pid;
        return !this.hasLiveOtherOwner(job);
    }

    /**
     * Another Studio server can share this user's durable job directory. Trust its PID only while that
     * process is actually alive; a stale record from a killed server must still be reconciled.
     */
    private hasLiveOtherOwner(job: StudioJobView): boolean {
        if (job.ownerPid !== undefined) {
            return job.ownerPid !== process.pid && isProcessAlive(job.ownerPid);
        }
        // Legacy records predate ownerPid. The process marker is the only owner evidence they carry.
        const processState = this.repository.getProcessState();
        if (processState?.status !== "running") return false;
        // A running marker without a PID was written by an older Studio version. It may belong to a
        // still-live server (including one started by another agent), so never interrupt its records
        // speculatively. Only a graceful-stop marker authorizes legacy recovery.
        if (processState.pid === undefined) return true;
        return processState.pid !== process.pid && isProcessAlive(processState.pid);
    }

    private async executeStarted<T>(started: StudioJobStartResult, executor: (context: StudioJobExecutorContext) => Promise<T>,
        terminalForResult: (value: T, cancelled: boolean) => StudioJobExecutorTerminal,
        terminalForException: (error: unknown, cancelled: boolean) => StudioJobExecutorTerminal): Promise<StudioJobExecutionResult<T>> {
        if (started.status !== "created") return started;
        const job = this.markRunning(started.job.id) ?? started.job;
        const signal = this.signal(job.id);
        if (signal === undefined) throw new Error(`Studio job "${job.id}" has no cancellation handle.`);
        const context: StudioJobExecutorContext = {job, signal, progress: (progress) => this.progress(job.id, progress)};
        let settle!: () => void;
        const completion = new Promise<void>((resolve) => {
            settle = resolve;
        });
        this.pendingExecutors.add(completion);
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
            const terminal = terminalForException(error, signal.aborted);
            // An exception cannot attest that cancellation cleanup succeeded,
            // even when a compatibility mapper supplies a cancelled label.
            this.persistExecutorTerminal(job.id, signal.aborted && terminal.status === "cancelled"
                ? {status: "recovery-required", recovery: {action: terminal.recovery?.action ?? "retry", reason: `Executor cleanup could not be confirmed after cancellation: ${error instanceof Error ? error.message : String(error)}`}}
                : terminal);
            throw error;
        } finally {
            settle();
            this.pendingExecutors.delete(completion);
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
        if (terminal.status === "recovery-required") {
            this.executorCleanupFailed = true;
            return this.terminal(id, "recovery-required", {recovery: terminal.recovery, ...(terminal.result ? {result: terminal.result} : {})});
        }
        if (terminal.status === "completed") return this.complete(id, terminal.result);
        if (terminal.status === "failed") return this.fail(id, terminal.error, terminal.recovery, terminal.result);
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

function isProcessAlive(pid: number): boolean {
    if (!Number.isSafeInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // EPERM means the process exists but belongs to another user; it is still a live owner.
        return (error as NodeJS.ErrnoException).code === "EPERM";
    }
}
