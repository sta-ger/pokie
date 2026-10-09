import {act, renderHook, waitFor} from "@testing-library/react";
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

    it("keeps the server-scoped canonical job when the routed project path is a symlink alias", async () => {
        const canonicalProjectId = "/real/projects/game";
        const fetchImpl: FetchLike = (url) => {
            expect(url).toBe("/api/project/jobs");
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: [job("job-canonical", canonicalProjectId, "completed")]})});
        };
        const {result} = renderHook(() => useProjectJobs(fetchImpl, "/aliases/game", 1));
        await waitFor(() => expect(result.current.jobs).toEqual([expect.objectContaining({id: "job-canonical", projectId: canonicalProjectId})]));
    });

    it("continues polling a canonical job opened through a routed symlink alias", async () => {
        jest.useFakeTimers();
        const canonicalProjectId = "/real/projects/game";
        let requests = 0;
        const fetchImpl: FetchLike = (url) => {
            requests++;
            if (url === "/api/project/jobs") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: [job("job-canonical", canonicalProjectId)]})});
            }
            if (url === "/api/project/jobs/job-canonical") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("job-canonical", canonicalProjectId, "completed"))});
            }
            throw new Error(`Unexpected request ${url}`);
        };
        const {result} = renderHook(() => useProjectJobs(fetchImpl, "/aliases/game", 1));
        await waitFor(() => expect(result.current.jobs[0]).toEqual(expect.objectContaining({status: "running"})));
        await act(async () => {
            jest.advanceTimersByTime(500);
            await Promise.resolve();
        });
        await waitFor(() => expect(result.current.jobs[0]).toEqual(expect.objectContaining({status: "completed", projectId: canonicalProjectId})));
        expect(requests).toBeGreaterThanOrEqual(2);
        jest.useRealTimers();
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

        act(() => result.current.cancel("job-a"));
        rerender({projectId: "/project-b", generation: 2});
        resolveCancellation?.({ok: true, status: 202, json: () => Promise.resolve({...job("job-a", "/project-a"), status: "cancelling"})});

        await waitFor(() => expect(result.current.jobs).toEqual([]));
    });
});


describe("useProjectJobs transport recovery", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    const record = (status: StudioJobView["status"] = "running") => job("job-a", "/project-a", status);
    const response = (body: unknown) => ({ok: true, status: 200, json: () => Promise.resolve(body)});
    const listPath = "/api/project/jobs";

    it("retries failed discovery, retains work across poll failure and incomplete lists, then reattaches without starting work", async () => {
        let lists = 0;
        let polls = 0;
        const calls: string[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            calls.push(`${init?.method ?? "GET"} ${url}`);
            if (url === listPath) {
                lists++;
                if (lists === 1 || lists === 3) return Promise.reject(new Error("offline discovery"));
                return Promise.resolve(response({jobs: lists === 4 ? [] : [record()]}));
            }
            if (url === `${listPath}/${record().id}`) {
                if (++polls === 1) return Promise.reject(new Error("offline observation"));
                return Promise.resolve(response(record("completed")));
            }
            throw new Error(`Unexpected request ${url}`);
        };
        const {result, unmount} = renderHook(() => useProjectJobs(fetchImpl, "/project-a", 1));
        await act(async () => {
            await Promise.resolve();
        });
        expect(result.current.connectionError).toContain("reconnecting automatically");
        await act(async () => {
            await jest.advanceTimersByTimeAsync(500);
        });
        expect(result.current.jobs[0].id).toBe(record().id);
        expect(result.current.connectionError).toBeUndefined();
        await act(async () => {
            await jest.advanceTimersByTimeAsync(500);
        });
        expect(result.current.connectionError).toContain("offline observation");
        await act(async () => {
            await jest.advanceTimersByTimeAsync(500);
        });
        expect(result.current.jobs[0].status).toBe("completed");
        await act(async () => {
            await result.current.refresh();
        });
        expect(result.current.connectionError).toBeUndefined();
        expect(result.current.jobs[0].status).toBe("completed");
        expect(calls.every((call) => call.startsWith("GET "))).toBe(true);
        unmount();
        const count = calls.length;
        await act(async () => {
            await jest.advanceTimersByTimeAsync(5_000);
        });
        expect(calls).toHaveLength(count);
    });

    it("exposes rejected cancel and resume, prevents duplicate activation, and keeps observing the same job", async () => {
        let cancelCalls = 0;
        let recoverCalls = 0;
        let rejected = true;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === listPath) return Promise.resolve(response({jobs: [record()]}));
            if (init?.method === "POST") {
                if (url.endsWith("/cancel")) cancelCalls++;
                else recoverCalls++;
                if (rejected) return Promise.reject(new Error("control unavailable"));
                return Promise.resolve(response(record("cancelling")));
            }
            return Promise.resolve(response(record("running")));
        };
        const {result, unmount} = renderHook(() => useProjectJobs(fetchImpl, "/project-a", 1));
        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            result.current.cancel(record().id);
            result.current.cancel(record().id);
            await Promise.resolve();
        });
        expect(cancelCalls).toBe(1);
        expect(result.current.actionError).toContain("Could not cancel");
        expect(result.current.pendingIds).toEqual([]);
        await act(async () => {
            await jest.advanceTimersByTimeAsync(500);
        });
        expect(result.current.jobs[0].status).toBe("running");
        expect(result.current.actionError).toContain("control unavailable");
        await act(async () => {
            result.current.recover(record().id);
            await Promise.resolve();
        });
        expect(recoverCalls).toBe(1);
        expect(result.current.actionError).toContain("Could not resume");
        rejected = false;
        await act(async () => {
            result.current.cancel(record().id);
            await Promise.resolve();
        });
        expect(result.current.jobs[0].status).toBe("cancelling");
        expect(result.current.actionError).toBeUndefined();
        // Neither subsequent discovery nor detail may regress accepted cancellation.
        await act(async () => {
            await jest.advanceTimersByTimeAsync(500);
        });
        expect(result.current.jobs[0].status).toBe("cancelling");
        unmount();
    });

    it("rejects a delayed same-job running poll after accepted cancellation and retains its terminal", async () => {
        let release: (() => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === listPath) return Promise.resolve(response({jobs: [record()]}));
            if (init?.method === "POST") return Promise.resolve(response(record("cancelled")));
            return new Promise((resolve) => {
                release = () => resolve(response(record()));
            });
        };
        const {result, unmount} = renderHook(() => useProjectJobs(fetchImpl, "/project-a", 1));
        await act(async () => {
            await Promise.resolve();
        });
        await act(async () => {
            await jest.advanceTimersByTimeAsync(500);
        });
        expect(release).toBeDefined();
        await act(async () => {
            result.current.cancel(record().id);
            await Promise.resolve();
        });
        expect(result.current.jobs[0].status).toBe("cancelled");
        await act(async () => {
            release?.();
            await Promise.resolve();
        });
        await act(async () => {
            await result.current.refresh();
        });
        expect(result.current.jobs[0].status).toBe("cancelled");
        unmount();
    });
});


it("discovers an explicitly resumed checkpoint incarnation with the same id without accepting its older terminal", async () => {
    const retained = job("job-a", "/project-a", "recovery-required");
    let current: StudioJobView = {...retained, createdAt: 1};
    const fetchImpl: FetchLike = () => Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: [current]})});
    const {result, unmount} = renderHook(() => useProjectJobs(fetchImpl, "/project-a", 1));
    await waitFor(() => expect(result.current.jobs[0]?.status).toBe("recovery-required"));
    current = {...retained, status: "running", createdAt: 3};
    await act(async () => {
        await result.current.refresh();
    });
    expect(result.current.jobs[0]?.status).toBe("running");
    current = {...retained, createdAt: 1};
    await act(async () => {
        await result.current.refresh();
    });
    expect(result.current.jobs[0]).toMatchObject({id: retained.id, status: "running", createdAt: 3});
    unmount();
});


it("bounds a hung discovery request and reattaches without leaving deadline timers after unmount", async () => {
    jest.useFakeTimers();
    let calls = 0;
    let signal: AbortSignal | undefined;
    const fetchImpl: FetchLike = (_url, init) => {
        if (++calls === 1) return new Promise((_resolve, reject) => {
            signal = init?.signal;
            signal?.addEventListener("abort", () => reject(new Error("Discovery timed out")), {once: true});
        });
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: [job("job-a", "/project-a", "completed")]})});
    };
    const {result, unmount} = renderHook(() => useProjectJobs(fetchImpl, "/project-a", 1));
    try {
        await act(async () => {
            await jest.advanceTimersByTimeAsync(10_000);
        });
        expect(signal?.aborted).toBe(true);
        expect(result.current.connectionError).toContain("Discovery timed out");
        await act(async () => {
            await jest.advanceTimersByTimeAsync(500);
        });
        expect(result.current.jobs[0]?.status).toBe("completed");
        expect(result.current.connectionError).toBeUndefined();
        unmount();
        expect(jest.getTimerCount()).toBe(0);
    } finally {
        unmount();
        jest.useRealTimers();
    }
});
