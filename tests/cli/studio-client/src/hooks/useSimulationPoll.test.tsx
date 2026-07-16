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
