import type {StudioJobView} from "../../api/types";

/** The newest completed simulation is the authoritative successor of an older interrupted run. */
export function latestCompletedSimulationAt(jobs: readonly StudioJobView[]): number {
    let latest = 0;
    for (const job of jobs) {
        if (job.operation === "simulation" && job.status === "completed") latest = Math.max(latest, job.createdAt);
    }
    return latest;
}

/**
 * A restart-interrupted simulation is historical once a newer run completed. The record stays in
 * Finished operations so its evidence can be inspected or dismissed, but it must not present stale
 * 0/N progress or a "needs attention" banner beside a completed report.
 */
export function isSupersededSimulationRecovery(job: StudioJobView, latestCompletedAt: number): boolean {
    return job.operation === "simulation" && job.status === "recovery-required" && job.createdAt < latestCompletedAt;
}
