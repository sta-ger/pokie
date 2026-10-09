import {act, renderHook, waitFor} from "@testing-library/react";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {useHomeSourceJobs} from "../../../../../cli/studio-client/src/hooks/useHomeSourceJobs";
import type {StudioJobView} from "../../../../../cli/studio-client/src/api/types";

const designJob = (status: StudioJobView["status"] = "running"): StudioJobView => ({
    id: "design-job", projectId: "design:/drafts/game.json", operation: "design-build", request: {sourcePath: "/drafts/game.json"},
    conflictKey: "design-build:/drafts/game.json", status, createdAt: 1, progress: {stage: "Building", unit: "files", current: 1, total: 2},
});

describe("useHomeSourceJobs", () => {
    it("discards an old source's delayed list failure and cancel response after a source change", async () => {
        let rejectOldList: ((error: Error) => void) | undefined;
        let finishOldCancel: (() => void) | undefined;
        let lists = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (init?.method === "POST") return new Promise((resolve) => {
                finishOldCancel = () => resolve({ok: true, status: 202, json: () => Promise.resolve(designJob("cancelling"))});
            });
            if (url.startsWith("/api/home/jobs?sourcePath=")) {
                if (++lists === 2) return new Promise((_resolve, reject) => {
                    rejectOldList = reject;
                });
                const discovered = url.includes("second.json") ? {...designJob("completed"), id: "second-job", projectId: "design:/second.json"} : designJob();
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: [discovered]})});
            }
            throw new Error(`Unexpected request ${url}`);
        };
        const {result, rerender, unmount} = renderHook(({source}) => useHomeSourceJobs(fetchImpl, source), {initialProps: {source: "/first.json"}});
        await waitFor(() => expect(result.current.jobs[0]?.id).toBe("design-job"));
        act(() => {
            result.current.refresh();
            result.current.cancel("design-job");
        });
        rerender({source: "/second.json"});
        await waitFor(() => expect(result.current.jobs[0]?.id).toBe("second-job"));
        await act(async () => {
            rejectOldList?.(new Error("old source disconnected"));
            finishOldCancel?.();
            await Promise.resolve();
        });
        expect(result.current.jobs).toEqual([expect.objectContaining({id: "second-job", status: "completed"})]);
        expect(result.current.connectionError).toBeUndefined();
        expect(result.current.actionError).toBeUndefined();
        unmount();
    });
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
        await waitFor(() => expect(second.result.current.pendingIds).toEqual([]));
        expect(second.result.current.jobs[0]).toEqual(expect.objectContaining({status: "completed"}));
        expect(calls).toEqual(["GET /api/home/jobs", "GET /api/home/jobs", "POST /api/home/jobs/design-job/cancel"]);
    });
});


describe("useHomeSourceJobs transport recovery", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    const record = (status: StudioJobView["status"] = "running") => designJob(status);
    const response = (body: unknown) => ({ok: true, status: 200, json: () => Promise.resolve(body)});
    const listPath = "/api/home/jobs";

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
        const {result, unmount} = renderHook(() => useHomeSourceJobs(fetchImpl));
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
        const {result, unmount} = renderHook(() => useHomeSourceJobs(fetchImpl));
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
        const {result, unmount} = renderHook(() => useHomeSourceJobs(fetchImpl));
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
    const retained = designJob("recovery-required");
    let current: StudioJobView = {...retained, createdAt: 1};
    const fetchImpl: FetchLike = () => Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: [current]})});
    const {result, unmount} = renderHook(() => useHomeSourceJobs(fetchImpl));
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
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({jobs: [designJob("completed")]})});
    };
    const {result, unmount} = renderHook(() => useHomeSourceJobs(fetchImpl));
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


describe("useHomeSourceJobs control response ownership", () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());
    const record = (status: StudioJobView["status"]) => designJob(status);
    const response = (body: unknown) => ({ok: true, status: 200, json: () => Promise.resolve(body)});
    const listPath = "/api/home/jobs";

    it.each([
        ["cancel", "list", "cancelling"], ["cancel", "detail", "cancelling"],
        ["recover", "list", "running"], ["recover", "detail", "running"],
        ["cancel", "list", "completed"], ["recover", "detail", "completed"],
    ] as const)("retains the terminal and outputs observed by %s's pending %s request before its %s acknowledgment", async (action, observation, acknowledgmentStatus) => {
        let current = record(action === "recover" ? "recovery-required" : "running");
        const executionTime = action === "recover" ? 3 : current.createdAt;
        const terminal: StudioJobView = {...record("completed"), createdAt: executionTime, completedAt: 5,
            result: {summary: "Finished work", outputs: [{label: "Retained output", path: "/output/result.json"}]}};
        let finishControl: (() => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            if (init?.method === "POST") return new Promise((resolve) => {
                finishControl = () => resolve(response({...record(acknowledgmentStatus), createdAt: executionTime}));
            });
            if (url === listPath) return Promise.resolve(response({jobs: [current]}));
            if (url === `${listPath}/${current.id}`) return Promise.resolve(response(terminal));
            throw new Error(`Unexpected request ${url}`);
        };
        const {result, unmount} = renderHook(() => useHomeSourceJobs(fetchImpl));
        try {
            await act(async () => {
                await Promise.resolve();
            });
            act(() => result.current[action](current.id));
            expect(finishControl).toBeDefined();
            expect(result.current.pendingIds).toEqual([current.id]);
            current = observation === "list" ? terminal : {...record("running"), createdAt: executionTime};
            await act(async () => {
                await result.current.refresh();
            });
            if (observation === "detail") {
                await act(async () => {
                    await jest.advanceTimersByTimeAsync(500);
                });
            }
            expect(result.current.jobs[0]).toEqual(terminal);
            expect(result.current.pendingIds).toEqual([current.id]);
            await act(async () => {
                finishControl?.();
                await Promise.resolve();
            });
            expect(result.current.jobs[0]).toEqual(terminal);
            expect(result.current.pendingIds).toEqual([]);
            expect(result.current.actionError).toBeUndefined();
        } finally {
            unmount();
        }
    });

    it("accepts an explicit same-ID resume response for a new execution and rejects the old execution's later discovery", async () => {
        const retained = record("recovery-required");
        const resumed: StudioJobView = {...retained, status: "running", createdAt: 3};
        const fetchImpl: FetchLike = (_url, init) => Promise.resolve(response(init?.method === "POST" ? resumed : {jobs: [retained]}));
        const {result, unmount} = renderHook(() => useHomeSourceJobs(fetchImpl));
        try {
            await act(async () => {
                await Promise.resolve();
            });
            await act(async () => {
                result.current.recover(retained.id);
                await Promise.resolve();
            });
            expect(result.current.jobs[0]).toEqual(resumed);
            await act(async () => {
                await result.current.refresh();
            });
            expect(result.current.jobs[0]).toEqual(resumed);
        } finally {
            unmount();
        }
    });

    it("rejects a delayed control acknowledgment from the execution preceding a discovered same-ID resume", async () => {
        let current = record("running");
        let finishControl: (() => void) | undefined;
        const fetchImpl: FetchLike = (_url, init) => {
            if (init?.method === "POST") return new Promise((resolve) => {
                finishControl = () => resolve(response(record("cancelled")));
            });
            return Promise.resolve(response({jobs: [current]}));
        };
        const {result, unmount} = renderHook(() => useHomeSourceJobs(fetchImpl));
        try {
            await act(async () => {
                await Promise.resolve();
            });
            act(() => result.current.cancel(current.id));
            current = {...current, createdAt: 3};
            await act(async () => {
                await result.current.refresh();
            });
            expect(result.current.jobs[0]).toEqual(current);
            await act(async () => {
                finishControl?.();
                await Promise.resolve();
            });
            expect(result.current.jobs[0]).toEqual(current);
        } finally {
            unmount();
        }
    });
});
