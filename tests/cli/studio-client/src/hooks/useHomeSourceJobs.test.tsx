import {act, renderHook, waitFor} from "@testing-library/react";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {useHomeSourceJobs} from "../../../../../cli/studio-client/src/hooks/useHomeSourceJobs";
import type {StudioJobView} from "../../../../../cli/studio-client/src/api/types";

const designJob = (status: StudioJobView["status"] = "running"): StudioJobView => ({
    id: "design-job", projectId: "design:/drafts/game.json", operation: "design-build", request: {sourcePath: "/drafts/game.json"},
    conflictKey: "design-build:/drafts/game.json", status, createdAt: 1, progress: {stage: "Building", unit: "files", current: 1, total: 2},
});

describe("useHomeSourceJobs", () => {
    it("rediscovers retained source-scoped work on a Home remount and keeps its controls source-scoped", async () => {
        const calls: string[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            calls.push(`${init?.method ?? "GET"} ${url}`);
            if (url === "/api/home/jobs") return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: [designJob("completed")]})});
            if (url === "/api/home/jobs/design-job/cancel" && init?.method === "POST") return Promise.resolve({ok: true, status: 202, json: () => Promise.resolve(designJob("cancelling"))});
            throw new Error(`Unexpected request ${url}`);
        };
        const first = renderHook(() => useHomeSourceJobs(fetchImpl));
        await waitFor(() => expect(first.result.current.jobs).toEqual([expect.objectContaining({id: "design-job", status: "completed"})]));
        first.unmount();

        const second = renderHook(() => useHomeSourceJobs(fetchImpl));
        await waitFor(() => expect(second.result.current.jobs).toEqual([expect.objectContaining({id: "design-job", status: "completed"})]));
        act(() => second.result.current.cancel("design-job"));
        await waitFor(() => expect(second.result.current.jobs[0]).toEqual(expect.objectContaining({status: "cancelling"})));
        expect(calls).toEqual(["GET /api/home/jobs", "GET /api/home/jobs", "POST /api/home/jobs/design-job/cancel"]);
    });
});
