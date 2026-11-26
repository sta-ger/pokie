import type {StudioJobView} from "../../../cli/studio-client/src/api/types.js";
import {groupHomeJobs, homeJobNeedsAttention, isFinishedHomeJob} from "../../../cli/studio-client/src/domain/interpret/HomeJobs.js";

function job(id: string, status: StudioJobView["status"]): StudioJobView {
    return {
        id,
        projectId: "project",
        operation: "project-open-materialization",
        request: {},
        conflictKey: `project-open:${id}`,
        status,
        createdAt: 0,
    };
}

describe("Home job grouping", () => {
    it("treats recovery-required as terminal and needing attention, not as active work", () => {
        const recovery = job("recovery", "recovery-required");
        expect(isFinishedHomeJob(recovery)).toBe(true);
        expect(homeJobNeedsAttention(recovery)).toBe(true);
        const groups = groupHomeJobs([recovery]);
        expect(groups.active).toEqual([]);
        expect(groups.needsAttention).toEqual([recovery]);
        expect(groups.archived).toEqual([]);
    });

    it("keeps running jobs active and completed jobs archived", () => {
        const running = job("running", "running");
        const completed = job("completed", "completed");
        const groups = groupHomeJobs([running, completed]);
        expect(groups.active).toEqual([running]);
        expect(groups.needsAttention).toEqual([]);
        expect(groups.archived).toEqual([completed]);
    });

    it("keeps failed and cancelled jobs visible for review", () => {
        const failed = job("failed", "failed");
        const cancelled = job("cancelled", "cancelled");
        const groups = groupHomeJobs([failed, cancelled]);
        expect(groups.needsAttention).toEqual([failed, cancelled]);
        expect(groups.archived).toEqual([]);
    });
});
