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

export type StudioOptimizationContext = {projectRoot: string; projectId: string; isCurrent(): boolean};
export class StudioOptimizationService {
    private accepting = true;
    private readonly executions = new Set<Promise<unknown>>();
    private readonly candidates = new Map<string, {candidate: OptimizationCandidate; request: OptimizationRequest}>();
    private readonly jobs: StudioJobService;
    private readonly optimizer: ProjectOptimizationService;
    public constructor(jobs: StudioJobService, optimizer = new ProjectOptimizationService()) {
        this.jobs = jobs;
        this.optimizer = optimizer;
    }
    public handle(method: string, action: "support" | "start" | "save", body: unknown, context: StudioOptimizationContext): Promise<{status: number; body: unknown}> {
        if (!this.accepting) return Promise.resolve({status: 409, body: {error: "Studio optimization is shutting down."}});
        const execution = this.handleOwned(method, action, body, context);
        this.executions.add(execution);
        execution.finally(() => this.executions.delete(execution)).catch(() => undefined);
        return execution;
    }
    public async drain(): Promise<void> {
        while (this.executions.size) await Promise.all([...this.executions]);
    }
    public async shutdown(): Promise<void> {
        this.accepting = false;
        await this.drain();
        for (const retained of this.candidates.values()) await this.optimizer.discard(retained.candidate);
        this.candidates.clear();
    }
    private async handleOwned(
        method: string,
        action: "support" | "start" | "save",
        body: unknown,
        context: StudioOptimizationContext,
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
            if (action === "save") {
                if (
                    typeof submitted.jobId !== "string" ||
                    typeof submitted.destination !== "string" ||
                    !submitted.destination.trim()
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
                const outputPath = await this.optimizer.publish(
                    retained.candidate,
                    retained.request,
                    submitted.destination,
                    {isCurrent: context.isCurrent},
                );
                return {status: 200, body: {outputPath}};
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
                        onProgress: (evidence) =>
                            executor.progress({
                                stage: evidence.phase ?? "Finite search",
                                current: evidence.phase === "assessment" ? evidence.stochastic?.assessmentSamples ?? 0 : evidence.consumedWork,
                                total: evidence.phase === "assessment" ? request.policy.sampling?.assessmentSamples ?? 0 : request.policy.budget,
                                unit: evidence.phase === "assessment" ? "held-out observations" : "candidates",
                                message: `${evidence.evaluated} evaluated; ${evidence.rejected} rejected; ${evidence.stochastic?.searchSamples ?? 0} search observations`,
                            }),
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
