import {act, renderHook, waitFor} from "@testing-library/react";
import {StrictMode, type ReactNode} from "react";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {StudioApiProvider} from "../../../../../cli/studio-client/src/context/StudioApiProvider";
import {useSimulationPoll} from "../../../../../cli/studio-client/src/hooks/useSimulationPoll";
import type {StudioSimulationJobView} from "../../../../../cli/studio-client/src/api/types";

function job(status: StudioSimulationJobView["status"], roundsCompleted: number): StudioSimulationJobView {
    return {id: "job-1", status, rounds: 10, workers: 1, startedAt: new Date().toISOString(), roundsCompleted, durationMs: 0};
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

describe("useSimulationPoll - StrictMode + cleanup", () => {
    it.each([5000000, 2000001, 0, -1, 12.5, NaN, Infinity])("rejects invalid rounds %s before any optimistic state or request mutation", async (rounds) => {
        const submitted: unknown[] = [];
        const fetchImpl: FetchLike = (_url, init) => {
            if (init?.method === "POST") submitted.push(JSON.parse(init.body ?? "{}"));
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("completed", 10))});
        };
        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});
        act(() => result.current.run(rounds, undefined, 1));
        expect(submitted).toEqual([]);
        expect(result.current.progress).toBeUndefined();
        expect(result.current.error).toBe("Rounds must be a positive integer between 1 and 2,000,000.");
        act(() => result.current.run(10, undefined, 1));
        await waitFor(() => expect(result.current.progress?.status).toBe("completed"));
        const retained = {job: result.current.job, progress: result.current.progress, receipt: result.current.terminalReceipt};
        act(() => result.current.run(rounds, undefined, 1));
        expect(submitted).toEqual([{rounds: 10, workers: 1}]);
        expect(result.current.job).toBe(retained.job);
        expect(result.current.progress).toBe(retained.progress);
        expect(result.current.terminalReceipt).toBe(retained.receipt);
        expect(result.current.currentJobId).toBe("job-1");
        // A rejected value must not acquire the double-submit guard.
        act(() => result.current.run(10, undefined, 1));
        await waitFor(() => expect(submitted).toHaveLength(2));
        await waitFor(() => expect(result.current.error).toBeUndefined());
    });

    it("rejects an oversized retained Retry without losing its durable job, then accepts a corrected Run", async () => {
        const submitted: unknown[] = [];
        const retained = {...job("failed", 0), id: "oversized-retained", rounds: 5000000};
        const fetchImpl: FetchLike = (url, init) => {
            if (init?.method === "POST") submitted.push(JSON.parse(init.body ?? "{}"));
            const value = url === "/api/project/simulations/oversized-retained" ? retained : job("completed", 10);
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(value)});
        };
        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});
        act(() => result.current.restore(retained.id));
        await waitFor(() => expect(result.current.progress?.status).toBe("failed"));
        const receipt = result.current.terminalReceipt;
        act(() => result.current.retry());
        expect(submitted).toEqual([]);
        expect(result.current.currentJobId).toBe(retained.id);
        expect(result.current.job).toEqual(retained);
        expect(result.current.terminalReceipt).toBe(receipt);
        expect(result.current.progress?.status).toBe("failed");
        expect(result.current.error).toBe("Rounds must be a positive integer between 1 and 2,000,000.");
        act(() => result.current.run(10, undefined, 1));
        await waitFor(() => expect(result.current.progress?.status).toBe("completed"));
        expect(submitted).toEqual([{rounds: 10, workers: 1}]);
        expect(result.current.error).toBeUndefined();
    });

    it("keeps Retry ownership through pending and rejected submission discovery until a project reset", async () => {
        let finishStart: (() => void) | undefined;
        let rejectStart = true;
        const submitted: unknown[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/simulations" && init?.method === "POST") {
                submitted.push(JSON.parse(init.body ?? "{}"));
                return new Promise((resolve) => {
                    finishStart = () => resolve(rejectStart
                        ? {ok: false, status: 400, json: () => Promise.resolve({error: "Rounds must be a positive integer."})}
                        : {ok: true, status: 201, json: () => Promise.resolve({...job("queued", 0), id: "accepted-retry"})});
                });
            }
            if (url === "/api/project/simulations/accepted-retry") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({...job("completed", 10), id: "accepted-retry"})});
            }
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({...job("completed", 99), id: "retained", rounds: 99})});
        };
        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});
        act(() => result.current.run(10, "attempted", 2));
        await act(async () => {
            result.current.restore("retained");
            finishStart?.();
            await Promise.resolve();
        });
        expect(result.current.error).toBe("Rounds must be a positive integer.");
        await act(async () => {
            result.current.restore("retained");
            await Promise.resolve();
        });
        expect(result.current.error).toBe("Rounds must be a positive integer.");
        expect(result.current.currentJobId).toBeUndefined();
        rejectStart = false;
        act(() => result.current.retry());
        await act(async () => {
            result.current.restore("retained");
            finishStart?.();
            await Promise.resolve();
        });
        expect(submitted).toEqual([{rounds: 10, seed: "attempted", workers: 2}, {rounds: 10, seed: "attempted", workers: 2}]);
        expect(result.current.terminalReceipt).toMatchObject({operation: "simulation-retry", capturedJobId: "accepted-retry", requestId: "accepted-retry"});
        act(() => result.current.resetForProjectSwitch());
        await act(async () => {
            result.current.restore("retained");
            await Promise.resolve();
        });
        expect(result.current.progress?.status).toBe("completed");
        expect(result.current.currentJobId).toBe("retained");
    });

    it("clears an optimistic queued state after a rejected start so a corrected rendered Configure submission can run", async () => {
        let starts = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/simulations" && init?.method === "POST") {
                starts += 1;
                return starts === 1
                    ? Promise.resolve({ok: false, status: 400, json: () => Promise.resolve({message: "Rounds exceed the configured durable-job limit."})})
                    : Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("completed", 10))});
            }
            if (url === "/api/project/simulations/job-1") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("completed", 10))});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.run(1_000_001, undefined, 1));
        await waitFor(() => expect(result.current.error).toContain("HTTP 400"));
        expect(result.current.progress).toBeUndefined();
        expect(result.current.job).toBeUndefined();
        expect(result.current.currentJobId).toBeUndefined();

        act(() => result.current.run(1, undefined, 1));
        await waitFor(() => expect(result.current.progress?.status).toBe("completed"));
        expect(starts).toBe(2);
    });

    it.each([false, true])("retains restored cancellation against an older poll (inFlight=%s)", async (inFlight) => {
        jest.useFakeTimers();
        let polls = 0;
        let releaseOldPoll: (() => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/simulations/job-1" && init?.method === "DELETE") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("cancelled", 2))});
            }
            if (url === "/api/project/simulations/job-1") {
                polls += 1;
                if (inFlight && polls === 2) {
                    return new Promise((resolve) => {
                        releaseOldPoll = () => resolve({ok: true, status: 200, json: () => Promise.resolve(job("running", 2))});
                    });
                }
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("running", 2))});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result, unmount} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        try {
            await act(async () => {
                result.current.restore("job-1");
                await Promise.resolve();
            });
            expect(result.current.job?.status).toBe("running");
            expect(result.current.currentJobId).toBe("job-1");
            if (inFlight) {
                await act(async () => {
                    await jest.advanceTimersByTimeAsync(500);
                });
                expect(releaseOldPoll).toBeDefined();
            }
            await act(async () => {
                result.current.cancel();
                await Promise.resolve();
            });
            expect(result.current.progress?.status).toBe("cancelled");
            await act(async () => {
                releaseOldPoll?.();
                await Promise.resolve();
            });
            await act(async () => {
                await jest.advanceTimersByTimeAsync(1_000);
            });
            expect(result.current.progress?.status).toBe("cancelled");
            expect(result.current.terminalReceipt).toEqual({operation: "simulation", jobId: "job-1", capturedJobId: "job-1", requestId: "job-1", status: "cancelled"});
            expect(polls).toBe(inFlight ? 2 : 1);
        } finally {
            unmount();
            jest.useRealTimers();
        }
    });

    it.each([false, true])("resumes durable polling after nonterminal cancellation or rejection (rejected=%s)", async (rejected) => {
        jest.useFakeTimers();
        let polls = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/simulations/job-1" && init?.method === "DELETE") {
                return Promise.resolve({ok: !rejected, status: rejected ? 503 : 200,
                    json: () => Promise.resolve(rejected ? {message: "Cancellation unavailable"} : job("cancelling", 2))});
            }
            if (url === "/api/project/simulations/job-1") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(++polls === 1 ? job("running", 2) : job("completed", 10))});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result, unmount} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});
        try {
            await act(async () => {
                result.current.restore("job-1");
                await Promise.resolve();
            });
            await act(async () => {
                result.current.cancel();
                await Promise.resolve();
            });
            expect(result.current.terminalReceipt).toBeUndefined();
            expect(result.current.cancellationRequested).toBe(!rejected);
            if (rejected) expect(result.current.error).toContain("HTTP 503");
            await act(async () => {
                await jest.advanceTimersByTimeAsync(500);
            });
            expect(result.current.progress?.status).toBe("completed");
            expect(result.current.cancellationRequested).toBe(false);
            expect(result.current.terminalReceipt?.status).toBe("completed");
        } finally {
            unmount();
            jest.useRealTimers();
        }
    });

    it("refuses an uncorrelated terminal while restoring an interrupted simulation", async () => {
        const fetchImpl: FetchLike = (url) => {
            if (url === "/api/project/simulations/retained-job") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({...job("recovery-required", 2), id: "different-job"})});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.restore("retained-job"));

        await waitFor(() => expect(result.current.error).toContain('did not match durable job "retained-job"'));
        expect(result.current.progress).toBeUndefined();
        expect(result.current.job).toBeUndefined();
        expect(result.current.terminalReceipt).toBeUndefined();
    });

    it("keeps a graceful-stop cancellation distinct from an abrupt restart recovery", async () => {
        const fetchImpl: FetchLike = (url) => {
            if (url === "/api/project/simulations/graceful-stop-job") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({...job("cancelled", 2), id: "graceful-stop-job"})});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.restore("graceful-stop-job"));

        await waitFor(() => expect(result.current.terminalReceipt).toEqual({
            operation: "simulation", jobId: "graceful-stop-job", capturedJobId: "graceful-stop-job", requestId: "graceful-stop-job", status: "cancelled",
        }));
        expect(result.current.terminalReceipt?.recoveredAfterRestart).toBeUndefined();
    });

    it("marks an accepted cancellation immediately and keeps it marked until the durable job reaches a terminal state", async () => {
        let releaseCancel: (() => void) | undefined;
        let starts = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/simulations" && init?.method === "POST") {
                starts += 1;
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("running", 2))});
            }
            if (url === "/api/project/simulations/job-1" && init?.method === "DELETE") {
                return new Promise((resolve) => {
                    releaseCancel = () => resolve({ok: true, status: 200, json: () => Promise.resolve(job("cancelled", 2))});
                });
            }
            if (url === "/api/project/simulations/job-1") {
                return new Promise(() => {
                    // Keep the ordinary poll pending while the cancel request is observed.
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.run(10, undefined, 1));
        await waitFor(() => expect(result.current.job?.status).toBe("running"));
        act(() => result.current.cancel());
        expect(result.current.cancellationRequested).toBe(true);
        act(() => releaseCancel?.());
        await waitFor(() => expect(result.current.progress?.status).toBe("cancelled"));
        expect(result.current.cancellationRequested).toBe(false);
        expect(result.current.terminalReceipt).toEqual({operation: "simulation", jobId: "job-1", capturedJobId: "job-1", requestId: "job-1", status: "cancelled"});
        act(() => result.current.retry());
        expect(result.current.operation).toBe("simulation-retry");
        expect(result.current.terminalReceipt).toBeUndefined();
        await waitFor(() => expect(starts).toBe(2));
    });

    it("keeps polling across StrictMode's dev-only mount -> cleanup -> mount cycle, instead of the second mount silently inheriting a cancelled state from the throwaway first mount", async () => {
        let getCalls = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/simulations" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/simulations/job-1") {
                getCalls += 1;
                const status = getCalls >= 2 ? "completed" : "running";
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job(status, getCalls * 3))});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => {
            result.current.run(10, undefined, 1);
        });

        await waitFor(() => expect(result.current.progress?.status).toBe("completed"));
        expect(getCalls).toBeGreaterThanOrEqual(2);
    });

    it("stops polling and issues no further HTTP requests once unmounted mid-poll", async () => {
        let getCalls = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/simulations" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/simulations/job-1") {
                getCalls += 1;
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("running", getCalls * 3))});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result, unmount} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => {
            result.current.run(10, undefined, 1);
        });

        await waitFor(() => expect(getCalls).toBeGreaterThanOrEqual(1));
        const callsAtUnmount = getCalls;
        unmount();

        // The job is still "running", so an un-cleaned-up hook would have a pending setTimeout that
        // fires another poll well within this window -- give it every chance to (incorrectly) do so.
        await new Promise((resolve) => {
            setTimeout(resolve, 700);
        });
        expect(getCalls).toBe(callsAtUnmount);
    });
});

describe("useSimulationPoll - resetForProjectSwitch", () => {
    it("retains the durable identity through a transient poll failure and clears the connection diagnostic after reattachment", async () => {
        jest.useFakeTimers();
        let polls = 0;
        let starts = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (init?.method === "POST") starts++;
            if (url === "/api/project/simulations/job-1") {
                polls++;
                if (polls === 2) return Promise.reject(new Error("connection interrupted"));
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job(polls > 2 ? "completed" : "running", polls > 2 ? 10 : 2))});
            }
            throw new Error(`Unexpected request ${url}`);
        };
        const {result, unmount} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});
        try {
            await act(async () => {
                result.current.restore("job-1");
                await Promise.resolve();
            });
            await act(async () => {
                await jest.advanceTimersByTimeAsync(500);
            });
            expect(result.current.job?.status).toBe("running");
            expect(result.current.currentJobId).toBe("job-1");
            expect(result.current.connectionError).toContain("reconnecting automatically");
            await act(async () => {
                await jest.advanceTimersByTimeAsync(500);
            });
            expect(result.current.connectionError).toBeUndefined();
            expect(result.current.terminalReceipt?.jobId).toBe("job-1");
            expect(result.current.progress?.status).toBe("completed");
            expect(starts).toBe(0);
            unmount();
            await act(async () => {
                await jest.advanceTimersByTimeAsync(5_000);
            });
            expect(polls).toBe(3);
        } finally {
            unmount();
            jest.useRealTimers();
        }
    });

    it("discards a start response that resolves after a project switch", async () => {
        let releaseStart: (() => void) | undefined;
        let pollCalls = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/simulations" && init?.method === "POST") {
                return new Promise((resolve) => {
                    releaseStart = () => resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
                });
            }
            if (url === "/api/project/simulations/job-1") {
                pollCalls += 1;
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.run(10, undefined, 1));
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
            if (url === "/api/project/simulations" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/simulations/job-1" && init?.method === "DELETE") {
                return new Promise((resolve) => {
                    releaseCancel = () => resolve({ok: true, status: 200, json: () => Promise.resolve(job("cancelled", 0))});
                });
            }
            if (url === "/api/project/simulations/job-1") {
                return new Promise(() => {
                    // Keep the old project's poll pending through the reset.
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.run(10, undefined, 1));
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
            if (url === "/api/project/simulations" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/simulations/job-1") {
                return new Promise((_, reject) => {
                    rejectPoll = reject;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };
        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.run(10, undefined, 1));
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

    it("clears job/progress/error so a genuinely different project never shows a trace of the previous one's simulation", async () => {
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/simulations" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/simulations/job-1") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("completed", 10))});
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => {
            result.current.run(10, undefined, 1);
        });
        await waitFor(() => expect(result.current.job?.status).toBe("completed"));

        act(() => {
            result.current.resetForProjectSwitch();
        });

        expect(result.current.job).toBeUndefined();
        expect(result.current.progress).toBeUndefined();
        expect(result.current.error).toBeUndefined();
        expect(result.current.currentJobId).toBeUndefined();
    });

    it("discards a poll response already in flight before the reset, instead of letting it repopulate the previous project's job", async () => {
        let releasePoll: (() => void) | undefined;
        let pollCalls = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/simulations" && init?.method === "POST") {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(job("queued", 0))});
            }
            if (url === "/api/project/simulations/job-1") {
                pollCalls += 1;
                if (pollCalls === 1) {
                    return new Promise((resolve) => {
                        releasePoll = () => resolve({ok: true, status: 200, json: () => Promise.resolve(job("completed", 10))});
                    });
                }
                return Promise.reject(new Error("no further polls expected"));
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => {
            result.current.run(10, undefined, 1);
        });
        await waitFor(() => expect(pollCalls).toBeGreaterThanOrEqual(1));

        // The project switches while that first poll is still unresolved.
        act(() => {
            result.current.resetForProjectSwitch();
        });
        expect(result.current.job).toBeUndefined();

        // Now let the stale poll for the *old* project's job resolve.
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

it("retains per-mode budgets and adaptive settings when retrying an all-mode job after reload", async () => {
    const convergence = {minRounds: 2, rtpTolerance: 0.01, checkIntervalRounds: 2, stableChecks: 1};
    const submitted: unknown[] = [];
    const retained = {...job("failed", 7), requestedRounds: 10, rounds: 20, modeName: "all", seed: "saved", convergence};
    const fetchImpl: FetchLike = (_url, init) => {
        if (init?.method === "POST") submitted.push(JSON.parse(init.body ?? "{}"));
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(retained)});
    };
    const {result, unmount} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});
    act(() => result.current.restore("job-1"));
    await waitFor(() => expect(result.current.progress?.status).toBe("failed"));
    act(() => result.current.retry());
    await waitFor(() => expect(submitted).toEqual([{rounds: 10, seed: "saved", workers: 1, modeName: "all", convergence}]));
    await waitFor(() => expect(result.current.progress?.status).toBe("failed"));
    unmount();
});

describe("V2C-34 simulation freshness authority", () => {
    it("retains job ownership across invalidation, rejection and conflict, then accepts first and subsequent fresh reuse", async () => {
        let starts = 0;
        let outcome: "created" | "rejected" | "conflict" = "created";
        let acceptedId = "created-1";
        const response = (body: unknown, status = 200) => Promise.resolve({ok: status < 400, status, json: () => Promise.resolve(body)});
        const fetchImpl: FetchLike = (url, init) => {
            if (init?.method === "POST") {
                starts++;
                if (outcome === "rejected") return response({error: "Invalid current source; correct it before retrying."}, 400);
                if (outcome === "conflict") return response({activeJobId: acceptedId}, 409);
                acceptedId = `created-${starts}`;
                return response({...job("queued", 0), id: acceptedId}, 201);
            }
            return response({...job("completed", 10), id: url.split("/").at(-1)});
        };
        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});
        act(() => result.current.run(10, "seed", 1));
        await waitFor(() => expect(result.current.progress?.status).toBe("completed"));
        expect(result.current.resultCurrent).toBe(true);
        const retained = {job: result.current.job, receipt: result.current.terminalReceipt};
        act(() => result.current.invalidateResult());
        expect(result.current.resultCurrent).toBe(false);
        expect(result.current.job).toBe(retained.job);
        expect(result.current.terminalReceipt).toBe(retained.receipt);
        act(() => result.current.run(0, undefined, 1));
        expect(starts).toBe(1);
        expect(result.current.resultCurrent).toBe(false);
        // Restore is a no-op on an already owned workflow; it cannot mint freshness.
        act(() => result.current.restore("other-job"));
        expect(result.current.currentJobId).toBe(retained.job?.id);
        outcome = "rejected";
        act(() => result.current.retry());
        await waitFor(() => expect(result.current.error).toContain("Invalid current source"));
        expect(result.current.resultCurrent).toBe(false);
        outcome = "created";
        act(() => result.current.retry());
        await waitFor(() => expect(result.current.currentJobId).toBe("created-3"));
        await waitFor(() => expect(result.current.progress?.status).toBe("completed"));
        expect(result.current.resultCurrent).toBe(true);
        act(() => result.current.invalidateResult());
        outcome = "conflict";
        act(() => result.current.run(10, "new-seed", 1));
        await waitFor(() => expect(result.current.currentJobId).toBe("created-3"));
        await waitFor(() => expect(result.current.progress?.status).toBe("completed"));
        expect(result.current.resultCurrent).toBe(false);
        outcome = "created";
        for (const id of ["created-5", "created-6"]) {
            act(() => result.current.retry());
            await waitFor(() => expect(result.current.currentJobId).toBe(id));
            await waitFor(() => expect(result.current.progress?.status).toBe("completed"));
            expect(result.current.resultCurrent).toBe(true);
        }
    });

    it.each(["acceptance", "poll"])("cannot regain freshness when a pre-save %s settles, and keeps cancellation usable", async pending => {
        let finish: (() => void) | undefined;
        let cancelled = false;
        let delay = true;
        const response = (body: unknown, status = 200) => ({ok: status < 400, status, json: () => Promise.resolve(body)});
        const fetchImpl: FetchLike = (url, init) => {
            if (init?.method === "DELETE") {
                cancelled = true;
                return Promise.resolve(response(job("cancelled", 5)));
            }
            const isStart = init?.method === "POST";
            const value = response(job(isStart ? "queued" : "running", isStart ? 0 : 5), isStart ? 201 : 200);
            if (delay && (isStart === (pending === "acceptance"))) {
                delay = false;
                return new Promise(resolve => {
                    finish = () => resolve(value);
                });
            }
            return Promise.resolve(value);
        };
        const {result} = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});
        act(() => result.current.run(10, undefined, 1));
        await waitFor(() => expect(finish).toBeDefined());
        act(() => result.current.invalidateResult());
        await act(async () => {
            finish!();
            await Promise.resolve();
        });
        await waitFor(() => expect(result.current.progress?.status).toBe("running"));
        expect(result.current.resultCurrent).toBe(false);
        expect(result.current.currentJobId).toBe("job-1");
        act(() => result.current.cancel());
        await waitFor(() => expect(result.current.progress?.status).toBe("cancelled"));
        expect(cancelled).toBe(true);
        expect(result.current.resultCurrent).toBe(false);
        expect(result.current.terminalReceipt).toMatchObject({capturedJobId: "job-1", status: "cancelled"});
    });

    it("treats restored history conservatively in fresh and previously used instances", async () => {
        const retained = job("completed", 10);
        const fetchImpl: FetchLike = (_url, init) => Promise.resolve({ok: true, status: init?.method === "POST" ? 201 : 200, json: () => Promise.resolve(retained)});
        const first = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});
        act(() => first.result.current.run(10, undefined, 1));
        await waitFor(() => expect(first.result.current.progress?.status).toBe("completed"));
        expect(first.result.current.resultCurrent).toBe(true);
        act(() => first.result.current.resetForProjectSwitch());
        act(() => first.result.current.restore("job-1"));
        await waitFor(() => expect(first.result.current.progress?.status).toBe("completed"));
        expect(first.result.current.resultCurrent).toBe(false);
        const second = renderHook(() => useSimulationPoll(), {wrapper: strictModeWrapper(fetchImpl)});
        act(() => second.result.current.restore("job-1"));
        await waitFor(() => expect(second.result.current.progress?.status).toBe("completed"));
        expect(second.result.current.resultCurrent).toBe(false);
        expect(second.result.current.job).toEqual(first.result.current.job);
    });
});
