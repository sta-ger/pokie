import {renderHook, waitFor} from "@testing-library/react";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {useProjectJobs} from "../../../../../cli/studio-client/src/hooks/useProjectJobs";
import type {StudioJobView} from "../../../../../cli/studio-client/src/api/types";

function job(id: string, projectId: string, status: StudioJobView["status"] = "running"): StudioJobView {
    return {
        id, projectId, operation: "simulation", request: {rounds: 10}, conflictKey: `simulation:${projectId}`,
        status, createdAt: 1, progress: {stage: "simulation", unit: "rounds", current: 3, total: 10},
    };
}

describe("useProjectJobs", () => {
    it("discovers persisted jobs on mount without a remembered job id", async () => {
        const fetchImpl: FetchLike = (url) => {
            expect(url).toBe("/api/project/jobs");
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: [job("job-a", "/project-a", "completed")]})});
        };
        const {result} = renderHook(() => useProjectJobs(fetchImpl, "/project-a", 1));
        await waitFor(() => expect(result.current.jobs).toEqual([expect.objectContaining({id: "job-a", status: "completed"})]));
    });

    it("rejects an old project's delayed list response after a genuine project change", async () => {
        let releaseFirst: (() => void) | undefined;
        const fetchImpl: FetchLike = () => new Promise((resolve) => {
            if (releaseFirst === undefined) {
                releaseFirst = () => resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: [job("job-a", "/project-a")]})});
                return;
            }
            resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: [job("job-b", "/project-b")]})});
        });
        const {result, rerender} = renderHook(({projectId, generation}) => useProjectJobs(fetchImpl, projectId, generation), {initialProps: {projectId: "/project-a", generation: 1}});
        rerender({projectId: "/project-b", generation: 2});
        releaseFirst?.();
        await waitFor(() => expect(result.current.jobs).toEqual([expect.objectContaining({id: "job-b", projectId: "/project-b"})]));
    });

    it("rejects a stale cancellation response after a genuine project change", async () => {
        let resolveCancellation: ((response: {ok: boolean; status: number; json: () => Promise<unknown>}) => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/jobs") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: [job("job-a", "/project-a")]})});
            }
            if (url === "/api/project/jobs/job-a/cancel" && init?.method === "POST") {
                return new Promise((resolve) => {
                    resolveCancellation = resolve;
                });
            }
            throw new Error(`Unexpected request ${url}`);
        };
        const {result, rerender} = renderHook(({projectId, generation}) => useProjectJobs(fetchImpl, projectId, generation), {initialProps: {projectId: "/project-a", generation: 1}});
        await waitFor(() => expect(result.current.jobs).toEqual([expect.objectContaining({id: "job-a"})]));

        result.current.cancel("job-a");
        rerender({projectId: "/project-b", generation: 2});
        resolveCancellation?.({ok: true, status: 202, json: () => Promise.resolve({...job("job-a", "/project-a"), status: "cancelling"})});

        await waitFor(() => expect(result.current.jobs).toEqual([]));
    });
});
