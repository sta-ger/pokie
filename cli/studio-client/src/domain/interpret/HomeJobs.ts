import type {StudioJobView} from "../../api/types.js";

/**
 * `recovery-required` is a terminal state: the process that owned the executor is gone, and the only
 * possible next step is an explicit retry or abandonment. Treating it as active made a restarted
 * Studio show a dead opening job as “Active jobs” forever.
 */
export function isFinishedHomeJob(job: Pick<StudioJobView, "status">): boolean {
    return job.status === "completed" || job.status === "failed" || job.status === "cancelled" || job.status === "recovery-required";
}

export function homeJobNeedsAttention(job: Pick<StudioJobView, "status">): boolean {
    return job.status === "failed" || job.status === "cancelled" || job.status === "recovery-required";
}

export type HomeJobGroups = {
    readonly active: StudioJobView[];
    readonly needsAttention: StudioJobView[];
    readonly archived: StudioJobView[];
};

/**
 * Presentation-only split for Home's job panel. An interrupted project opening remains prominent
 * (with its Retry action) instead of masquerading as still-running work or disappearing into the
 * collapsed finished-jobs list.
 */
export function groupHomeJobs(jobs: readonly StudioJobView[]): HomeJobGroups {
    const active: StudioJobView[] = [];
    const needsAttention: StudioJobView[] = [];
    const archived: StudioJobView[] = [];
    for (const job of jobs) {
        if (!isFinishedHomeJob(job)) {
            active.push(job);
        } else if (homeJobNeedsAttention(job)) {
            needsAttention.push(job);
        } else {
            archived.push(job);
        }
    }
    return {active, needsAttention, archived};
}
