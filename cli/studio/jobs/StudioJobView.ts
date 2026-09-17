/**
 * The durable, project-scoped representation used by every asynchronous Studio
 * operation.  Operation adapters may add operation-specific values to result,
 * but lifecycle state is deliberately kept here rather than in those adapters.
 */
export type StudioJobStatus = "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled" | "recovery-required";

export type StudioJobProgressView = {
    readonly stage: string;
    readonly unit: string;
    readonly current: number | string;
    readonly total: number | string;
    readonly message?: string;
};

export type StudioJobRecoveryView = {
    readonly action: "resume" | "retry" | "rebuild" | "new-session";
    readonly reason: string;
};

export type StudioJobOutputView = {
    readonly path?: string;
    readonly downloadPath?: string;
    readonly label: string;
};

export type StudioJobResultView = {
    readonly summary: string;
    readonly outputs?: readonly StudioJobOutputView[];
    readonly provenance?: Readonly<Record<string, unknown>>;
    readonly warnings?: readonly string[];
    readonly detail?: Readonly<Record<string, unknown>>;
};

export type StudioJobView = {
    readonly id: string;
    readonly projectId: string;
    readonly operation: string;
    readonly request: Readonly<Record<string, unknown>>;
    readonly conflictKey: string;
    readonly status: StudioJobStatus;
    readonly createdAt: number;
    readonly startedAt?: number;
    readonly completedAt?: number;
    readonly durationMs?: number;
    readonly progress?: StudioJobProgressView;
    readonly result?: StudioJobResultView;
    readonly error?: string;
    readonly recovery?: StudioJobRecoveryView;
};

export const isStudioJobTerminal = (status: StudioJobStatus): boolean =>
    status === "completed" || status === "failed" || status === "cancelled" || status === "recovery-required";
