import type {
    OptimizationCandidate,
    OptimizationRequest,
    OptimizationResult,
} from "../../../src/optimization/OptimizationPolicy.js";
import {ProjectOptimizationService} from "../../../src/optimization/ProjectOptimizationService.js";
import {
    OptimizationInputError,
    validateOptimizationRequest,
} from "../../../src/optimization/validateOptimizationRequest.js";
import {projectRevision} from "../../../src/optimization/internal/optimizationData.js";
import {ProjectTargetResolver} from "../../../src/project/ProjectTargetResolver.js";
import type {StudioJobService} from "../jobs/StudioJobService.js";

export type StudioOptimizationContext = {
    projectRoot: string;
    projectId: string;
    isCurrent(): boolean;
    /** Called synchronously at commit; its returned cleanup remains owned by this operation. */
    onAuthoredCommit?(): Promise<void>;
};
export class StudioOptimizationService {
    private accepting = true;
    private releasing = 0;
    private refreshFailure?: Error;
    private readonly admissions = new Set<AbortController>();
    private readonly mutations = new Set<string>();
    private readonly executions = new Set<Promise<unknown>>();
    private readonly candidates = new Map<string, {candidate: OptimizationCandidate; request: OptimizationRequest}>();
    private readonly jobs: StudioJobService;
    private readonly optimizer: ProjectOptimizationService;
    public constructor(jobs: StudioJobService, optimizer = new ProjectOptimizationService()) {
        this.jobs = jobs;
        this.optimizer = optimizer;
    }
    public handle(method: string, action: "support" | "start" | "save" | "apply", body: unknown, context: StudioOptimizationContext): Promise<{status: number; body: unknown}> {
        if (!this.accepting || this.releasing) return Promise.resolve({status: 409, body: {error: "Studio optimization is shutting down or changing Project."}});
        const controller = new AbortController();
        this.admissions.add(controller);
        const ownedContext = {...context, isCurrent: () => this.accepting && !controller.signal.aborted && context.isCurrent()};
        const execution = this.handleOwned(method, action, body, ownedContext, controller.signal);
        this.executions.add(execution);
        execution.finally(() => {
            this.executions.delete(execution);
            this.admissions.delete(controller);
        }).catch(() => undefined);
        return execution;
    }
    public async drain(): Promise<void> {
        let failure: unknown;
        while (this.executions.size) {
            const results = await Promise.allSettled([...this.executions]);
            for (const result of results) if (result.status === "rejected") failure = result.reason;
        }
        if (failure) throw failure;
        if (this.refreshFailure) throw this.refreshFailure;
    }
    public async releaseCandidates(): Promise<void> {
        this.releasing++;
        for (const controller of this.admissions) controller.abort();
        for (const job of this.jobs.list()) if (job.operation === "optimization" && ["queued", "running"].includes(job.status)) this.jobs.cancel(job.projectId, job.id);
        try {
            const failures: unknown[] = [];
            try {
                await this.drain();
            } catch (error) {
                failures.push(error);
            }
            for (const [id, retained] of this.candidates) {
                try {
                    await this.optimizer.discard(retained.candidate);
                    this.candidates.delete(id);
                } catch (error) {
                    failures.push(error);
                }
            }
            if (failures.length) throw new Error(`Optimization lifecycle cleanup failed: ${failures.map(String).join("; ")}`);
        } finally {
            this.releasing--;
        }
    }
    public async shutdown(): Promise<void> {
        this.accepting = false;
        for (const job of this.jobs.list()) if (job.operation === "optimization" && ["queued", "running"].includes(job.status)) this.jobs.cancel(job.projectId, job.id);
        await this.releaseCandidates();
    }
    private async handleOwned(
        method: string,
        action: "support" | "start" | "save" | "apply",
        body: unknown,
        context: StudioOptimizationContext,
        signal: AbortSignal,
    ): Promise<{status: number; body: unknown}> {
        try {
            if (method !== "POST") return {status: 405, body: {error: "Use POST."}};
            const submitted = body as {
                expectedProjectRoot?: unknown;
                request?: unknown;
                sourceRevision?: unknown;
                jobId?: unknown;
                destination?: unknown;
            };
            if (!submitted || typeof submitted !== "object") throw new Error("Expected an optimization request.");
            if (submitted.expectedProjectRoot !== context.projectRoot || !context.isCurrent()) return {status: 409, body: {error: "Project changed. Reopen the intended Project before optimizing or saving."}};
            if (action === "save" || action === "apply") {
                if (
                    typeof submitted.jobId !== "string" ||
                    (action === "save" && (typeof submitted.destination !== "string" || !submitted.destination.trim()))
                ) throw new Error("jobId and destination are required.");
                const job = this.jobs.get(context.projectId, submitted.jobId);
                const retained = this.candidates.get(submitted.jobId);
                if (
                    !job ||
                    job.operation !== "optimization" ||
                    job.status !== "completed" ||
                    !retained ||
                    !context.isCurrent()
                ) return {status: 409, body: {error: "Candidate unavailable or Project changed. Optimize again."}};
                const request = validateOptimizationRequest(submitted.request);
                if (this.mutations.has(submitted.jobId)) throw new Error("Candidate save/apply is already in progress.");
                this.mutations.add(submitted.jobId);
                try {
                    let refresh: Promise<void> | undefined;
                    const onAuthoredCommit = (): void => {
                        // Start invalidation in the commit's call stack, before any old preparation
                        // can resume. A later lifecycle cancellation cannot undo a completed commit.
                        try {
                            refresh = context.onAuthoredCommit?.();
                        } catch (error) {
                            refresh = Promise.reject(error);
                        }
                        refresh?.catch(() => undefined);
                    };
                    const outputPath = action === "apply"
                        ? await this.optimizer["apply"](retained.candidate, request, {isCurrent: context.isCurrent, signal, onAuthoredCommit})
                        : await this.optimizer.publish(retained.candidate, request, submitted.destination as string, {isCurrent: context.isCurrent, signal});
                    let warning: string | undefined;
                    try {
                        await refresh;
                    } catch (error) {
                        this.refreshFailure = new Error(`Committed optimization runtime cleanup failed: ${String(error)}`);
                        warning = `Source was applied and its preview consumed, but runtime refresh failed. Reopen the Project before playing: ${String(error)}`;
                    }
                    if (action === "apply") {
                        try {
                            this.jobs.recordOptimizationApply(context.projectId, submitted.jobId, outputPath);
                        } catch (error) {
                            warning = [warning, `Source was applied, but its durable apply marker could not be saved. The old preview is consumed; inspect the source before retrying: ${String(error)}`].filter(Boolean).join(" ");
                        }
                    }
                    return {status: 200, body: {outputPath, ...(warning ? {warning} : {})}};
                } finally {
                    this.mutations.delete(submitted.jobId);
                }
            }
            const request = validateOptimizationRequest(submitted.request);
            const project = await new ProjectTargetResolver().resolve(context.projectRoot, {readConfigurationProvenance: false});
            if (!project) return {status: 400, body: {error: "Unsupported Project."}};
            const revision = projectRevision(project);
            if (!context.isCurrent()) return {status: 409, body: {error: "Project changed."}};
            if (action === "support") {
                const support = await this.optimizer.support(project, request);
                if (!context.isCurrent()) return {status: 409, body: {error: "Project changed."}};
                return {status: 200, body: {...support, sourceRevision: revision}};
            }
            if (submitted.sourceRevision !== revision) return {
                status: 409,
                body: {error: "Source changed or no support preview. Refresh support before optimizing.", request},
            };
            const launched = this.jobs.launch(
                {
                    projectId: context.projectId,
                    operation: "optimization",
                    request: {request, sourceRevision: revision},
                    conflictKey: `optimization:${context.projectId}`,
                },
                async (executor) => {
                    const result = await this.optimizer.optimize(project, request, {
                        signal: executor.signal,
                        isCurrent: context.isCurrent,
                        onProgress: (evidence) => {
                            const assessing = evidence.phase === "assessment";
                            const candidateTotal = String(BigInt(request.policy.budget) < BigInt(evidence.domainSize) ? request.policy.budget : evidence.domainSize);
                            let total: string | number = assessing ? request.policy.sampling?.assessmentSamples ?? 0 : candidateTotal;
                            if (evidence.work) total = evidence.work.total ?? "indeterminate";
                            executor.progress({
                                // Work counts restart for every measured candidate. A poll can
                                // skip the intervening phases, so each stored stage must identify
                                // its candidate even when the next observed count is smaller.
                                stage: evidence.work
                                    ? `${evidence.work.stage} (candidate ${evidence.consumedWork} of ${candidateTotal})`
                                    : evidence.phase ?? "Finite search",
                                current: evidence.work?.current ?? (assessing ? evidence.stochastic?.assessmentSamples ?? 0 : evidence.evaluated + evidence.rejected),
                                total,
                                unit: evidence.work?.unit ?? (assessing ? "held-out observations" : "candidates"),
                                message: `${evidence.evaluated} evaluated; ${evidence.rejected} rejected; ${evidence.stochastic?.searchSamples ?? 0} search observations`,
                            });
                        },
                    });
                    if (result.candidate && (!context.isCurrent() || executor.signal.aborted)) {
                        await this.optimizer.discard(result.candidate);
                        return {
                            ...result,
                            status: executor.signal.aborted ? "cancelled" : "failure",
                            candidate: undefined,
                            diagnostics: [
                                {
                                    path: "project",
                                    message: "Project changed or operation cancelled; candidate discarded.",
                                },
                            ],
                        } as OptimizationResult;
                    }
                    if (result.candidate) this.candidates.set(executor.job.id, {candidate: result.candidate, request});
                    return result;
                },
                (result) => {
                    const retained = {
                        summary: `Optimization ${result.status}`,
                        detail: result as unknown as Record<string, unknown>,
                    };
                    if (result.diagnostics.some((item) => item.path === "cleanup")) return {
                        status: "recovery-required",
                        recovery: {
                            action: "retry",
                            reason: "Optimization cleanup failed. Inspect retained scratch output before retrying.",
                        },
                        result: retained,
                    };
                    if (result.status === "failure") return {
                        status: "failed",
                        error: result.diagnostics.map((item) => item.message).join("; "),
                        result: retained,
                    };
                    return result.status === "cancelled"
                        ? {status: "cancelled", result: retained}
                        : {status: "completed", result: retained};
                },
            );
            if (launched.started.status === "conflict") return {status: 409, body: {error: launched.started.reason, activeJobId: launched.started.activeJobId}};
            const execution = launched.completion;
            if (execution) {
                this.executions.add(execution);
                execution.catch(() => undefined).finally(() => this.executions.delete(execution));
            }
            return {status: 202, body: {job: launched.started.job}};
        } catch (error) {
            return {
                status: error instanceof OptimizationInputError ? 400 : 409,
                body: {
                    error: (error as Error).message,
                    diagnostics: error instanceof OptimizationInputError ? error.diagnostics : undefined,
                    submitted: body,
                },
            };
        }
    }
}
