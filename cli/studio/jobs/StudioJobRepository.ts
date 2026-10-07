import type {StudioJobView} from "./StudioJobView.js";

/**
 * Process-level state sits beside individual durable jobs.  A job alone
 * cannot say whether its former owner disappeared or completed Studio's
 * cooperative shutdown path, which is the distinction restart recovery
 * needs to preserve.
 */
export type StudioJobProcessState = {
    readonly status: "running" | "gracefully-stopped";
    readonly updatedAt: number;
};

export interface StudioJobRepository {
    list(projectId?: string): readonly StudioJobView[];
    get(id: string): StudioJobView | undefined;
    save(job: StudioJobView): void;
    remove(id: string): void;
    getProcessState(): StudioJobProcessState | undefined;
    saveProcessState(state: StudioJobProcessState): void;
}
