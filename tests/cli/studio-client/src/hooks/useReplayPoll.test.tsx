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
