import {act, renderHook, waitFor} from "@testing-library/react";
import {StrictMode, type ReactNode} from "react";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {StudioApiProvider} from "../../../../../cli/studio-client/src/context/StudioApiProvider";
import {useReplayPoll} from "../../../../../cli/studio-client/src/hooks/useReplayPoll";
import type {StudioReplayJobView} from "../../../../../cli/studio-client/src/api/types";

function job(status: StudioReplayJobView["status"], completedRounds: number): StudioReplayJobView {
    return {id: "job-1", status, round: 5, startedAt: new Date().toISOString(), completedRounds, durationMs: 0};
}

function strictModeWrapper(fetchImpl: FetchLike) {
    return function Wrapper({children}: {children: ReactNode}) {
        return (
            <StrictMode>
                <StudioApiProvider fetchImpl={fetchImpl}>{children}</StudioApiProvider>
            </StrictMode>
        );
    };
}

describe("useReplayPoll - StrictMode + cleanup", () => {
    it("keeps polling across StrictMode's dev-only mount -> cleanup -> mount cycle, instead of the second mount silently inheriting a cancelled state from the throwaway first mount", async () => {
        let getCalls = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/replays" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/replays/job-1") {
                getCalls += 1;
                const status = getCalls >= 2 ? "completed" : "running";
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job(status, getCalls))});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result} = renderHook(() => useReplayPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => {
            result.current.run(5, undefined);
        });

        await waitFor(() => expect(result.current.progress?.status).toBe("completed"));
        expect(getCalls).toBeGreaterThanOrEqual(2);
    });

    it("stops polling and issues no further HTTP requests once unmounted mid-poll", async () => {
        let getCalls = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/replays" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/replays/job-1") {
                getCalls += 1;
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("running", getCalls))});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result, unmount} = renderHook(() => useReplayPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => {
            result.current.run(5, undefined);
        });

        await waitFor(() => expect(getCalls).toBeGreaterThanOrEqual(1));
        const callsAtUnmount = getCalls;
        unmount();

        await new Promise((resolve) => {
            setTimeout(resolve, 700);
        });
        expect(getCalls).toBe(callsAtUnmount);
    });

    it("calls onTerminal exactly once when the job completes, even though onTerminal is read via a ref kept in sync across StrictMode's extra render", async () => {
        let getCalls = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/replays" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/replays/job-1") {
                getCalls += 1;
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("completed", getCalls))});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const onTerminal = jest.fn();

        const {result} = renderHook(() => useReplayPoll(onTerminal), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => {
            result.current.run(5, undefined);
        });

        await waitFor(() => expect(result.current.progress?.status).toBe("completed"));
        expect(onTerminal).toHaveBeenCalledTimes(1);
    });
});

describe("useReplayPoll - resetForProjectSwitch", () => {
    it("discards a start response that resolves after a project switch", async () => {
        let releaseStart: (() => void) | undefined;
        let pollCalls = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/replays" && init?.method === "POST") {
                return new Promise((resolve) => {
                    releaseStart = () => resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
                });
            }
            if (url === "/api/project/replays/job-1") {
                pollCalls += 1;
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useReplayPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.run(5, undefined));
        act(() => result.current.resetForProjectSwitch());
        act(() => releaseStart?.());

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 20);
        });
        expect(result.current.job).toBeUndefined();
        expect(result.current.progress).toBeUndefined();
        expect(result.current.error).toBeUndefined();
        expect(pollCalls).toBe(0);
    });

    it("discards a cancel response that resolves after a project switch", async () => {
        let releaseCancel: (() => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/replays" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/replays/job-1" && init?.method === "DELETE") {
                return new Promise((resolve) => {
                    releaseCancel = () => resolve({ok: true, status: 200, json: () => Promise.resolve(job("cancelled", 0))});
                });
            }
            if (url === "/api/project/replays/job-1") {
                return new Promise(() => {
                    // Keep the old project's poll pending through the reset.
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useReplayPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.run(5, undefined));
        await waitFor(() => expect(result.current.job?.status).toBe("queued"));
        act(() => result.current.cancel());
        act(() => result.current.resetForProjectSwitch());
        act(() => releaseCancel?.());

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 20);
        });
        expect(result.current.job).toBeUndefined();
        expect(result.current.progress).toBeUndefined();
        expect(result.current.error).toBeUndefined();
    });

    it("discards a poll failure that arrives after a project switch", async () => {
        let rejectPoll: ((reason?: unknown) => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/replays" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/replays/job-1") {
                return new Promise((_, reject) => {
                    rejectPoll = reject;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useReplayPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.run(5, undefined));
        await waitFor(() => expect(rejectPoll).toBeDefined());
        act(() => result.current.resetForProjectSwitch());
        act(() => rejectPoll?.(new Error("old project poll failed")));

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 20);
        });
        expect(result.current.job).toBeUndefined();
        expect(result.current.progress).toBeUndefined();
        expect(result.current.error).toBeUndefined();
    });

    it("does not refresh replays when an old project's terminal poll resolves after a switch", async () => {
        let releasePoll: (() => void) | undefined;
        const onTerminal = jest.fn();
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/replays" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/replays/job-1") {
                return new Promise((resolve) => {
                    releasePoll = () => resolve({ok: true, status: 200, json: () => Promise.resolve(job("completed", 5))});
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useReplayPoll(onTerminal), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.run(5, undefined));
        await waitFor(() => expect(releasePoll).toBeDefined());
        act(() => result.current.resetForProjectSwitch());
        act(() => releasePoll?.());

        await new Promise<void>((resolve) => {
            setTimeout(resolve, 20);
        });
        expect(result.current.job).toBeUndefined();
        expect(result.current.progress).toBeUndefined();
        expect(onTerminal).not.toHaveBeenCalled();
    });

    it("clears job/progress/error so a genuinely different project never shows a trace of the previous one's replay", async () => {
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/replays" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/replays/job-1") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("completed", 5))});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result} = renderHook(() => useReplayPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => {
            result.current.run(5, undefined);
        });
        await waitFor(() => expect(result.current.job?.status).toBe("completed"));

        act(() => {
            result.current.resetForProjectSwitch();
        });

        expect(result.current.job).toBeUndefined();
        expect(result.current.progress).toBeUndefined();
        expect(result.current.error).toBeUndefined();
    });

    it("discards a poll response already in flight before the reset, instead of letting it repopulate the previous project's job", async () => {
        let releasePoll: (() => void) | undefined;
        let pollCalls = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/replays" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/replays/job-1") {
                pollCalls += 1;
                if (pollCalls === 1) {
                    return new Promise((resolve) => {
                        releasePoll = () => resolve({ok: true, status: 200, json: () => Promise.resolve(job("completed", 5))});
                    });
                }
                return Promise.reject(new Error("no further polls expected"));
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result} = renderHook(() => useReplayPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => {
            result.current.run(5, undefined);
        });
        await waitFor(() => expect(pollCalls).toBeGreaterThanOrEqual(1));

        act(() => {
            result.current.resetForProjectSwitch();
        });
        expect(result.current.job).toBeUndefined();

        act(() => {
            releasePoll?.();
        });
        await new Promise((resolve) => {
            setTimeout(resolve, 50);
        });

        expect(result.current.job).toBeUndefined();
        expect(result.current.progress).toBeUndefined();
    });
});


describe("useReplayPoll rejected starts and reuse", () => {
    it("clears the prior job on rejection and permits two successful reuses and explicit selection", async () => {
        let starts = 0;
        const deletes: string[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            if (init?.method === "DELETE") {
                deletes.push(url);
                return Promise.reject(new Error("No cancellation expected"));
            }
            if (url === "/api/project/replays" && init?.method === "POST") {
                starts++;
                if (starts === 2) return Promise.resolve({ok: false, status: 400, json: () => Promise.resolve({error: "Simulation replay requires the retained seed."})});
                return Promise.resolve({ok: true, status: 202, json: () => Promise.resolve({...job("queued", 0), id: `job-${starts}`})});
            }
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({...job("completed", 5), id: url.split("/").pop()!})});
        };
        const onTerminal = jest.fn();
        const {result} = renderHook(() => useReplayPoll(onTerminal), {wrapper: strictModeWrapper(fetchImpl)});
        act(() => result.current.cancel()); // No-op before execution.
        act(() => result.current.run(5, "original"));
        await waitFor(() => expect(result.current.job?.id).toBe("job-1"));
        await waitFor(() => expect(result.current.progress?.status).toBe("completed"));
        const saved = result.current.job!;
        act(() => result.current.run(5, undefined, "seedless"));
        await waitFor(() => expect(result.current.error).toContain("retained seed"));
        expect(result.current.progress).toBeUndefined();
        expect(result.current.job).toBeUndefined();
        act(() => result.current.cancel()); // Rejection must not cancel the prior successful job.
        expect(deletes).toEqual([]);
        // Explicit selection is distinct from internal rejected-start recovery.
        act(() => result.current.selectExisting(saved));
        expect(result.current.error).toBeUndefined();
        expect(result.current.job).toEqual(saved);
        for (const id of ["job-3", "job-4"]) {
            act(() => result.current.run(5, "original"));
            await waitFor(() => expect(result.current.job?.id).toBe(id));
            await waitFor(() => expect(result.current.progress?.status).toBe("completed"));
            expect(result.current.error).toBeUndefined();
        }
        expect(onTerminal).toHaveBeenCalledTimes(3);
    });

    it("allows a first successful start after a preflight rejection in a fresh instance", async () => {
        let reject = true;
        const fetchImpl: FetchLike = (_url, init) => {
            if (init?.method === "POST" && reject) return Promise.reject(new Error("Failed to fetch"));
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("completed", 5))});
        };
        const {result} = renderHook(() => useReplayPoll(), {wrapper: strictModeWrapper(fetchImpl)});
        act(() => result.current.run(5, "seed"));
        await waitFor(() => expect(result.current.error).toBe("Failed to fetch"));
        expect(result.current.progress).toBeUndefined();
        reject = false;
        act(() => result.current.run(5, "seed"));
        await waitFor(() => expect(result.current.progress?.status).toBe("completed"));
        expect(result.current.error).toBeUndefined();
    });
});


it("reuses the replay controller after an executed failure and selects a saved job in a fresh instance", async () => {
    let starts = 0;
    const fetchImpl: FetchLike = (_url, init) => {
        if (init?.method === "POST") starts++;
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({...job(starts === 2 ? "failed" : "completed", 5), id: `executed-${starts}`})});
    };
    const {result, unmount} = renderHook(() => useReplayPoll(), {wrapper: strictModeWrapper(fetchImpl)});
    let saved: StudioReplayJobView | undefined;
    for (const expected of ["completed", "failed", "completed", "completed"]) {
        act(() => result.current.run(5, "seed"));
        await waitFor(() => expect(result.current.progress?.status).toBe(expected));
        if (starts === 1) saved = result.current.job;
    }
    act(() => result.current.selectExisting(saved!));
    expect(result.current.job).toEqual(saved);
    unmount();
    const fresh = renderHook(() => useReplayPoll(), {wrapper: strictModeWrapper(fetchImpl)});
    act(() => fresh.result.current.selectExisting(saved!));
    expect(fresh.result.current.job).toEqual(saved);
    expect(fresh.result.current.progress?.status).toBe("completed");
});
