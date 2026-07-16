import {act, renderHook, waitFor} from "@testing-library/react";
import type {ReactNode} from "react";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import {StudioApiProvider} from "../../../../../cli/studio-client/src/context/StudioApiProvider";
import {useRuntimeManager} from "../../../../../cli/studio-client/src/hooks/useRuntimeManager";

function wrapper(fetchImpl: FetchLike) {
    return function Wrapper({children}: {children: ReactNode}) {
        return <StudioApiProvider fetchImpl={fetchImpl}>{children}</StudioApiProvider>;
    };
}

describe("useRuntimeManager - double-submit guards", () => {
    it("start(): a second call while the first is still in flight is a silent no-op, not a second request", async () => {
        let resolveStart: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        let startCalls = 0;
        const fetchImpl: FetchLike = (url) => {
            if (url === "/api/project/runtime/start") {
                startCalls += 1;
                return new Promise((resolve) => {
                    resolveStart = resolve;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result} = renderHook(() => useRuntimeManager(), {wrapper: wrapper(fetchImpl)});

        act(() => {
            result.current.start({});
        });
        expect(startCalls).toBe(1);

        // A double-click (or a second effect-driven call) while the first request is still unresolved
        // must be refused by the guard, not issue a competing second HTTP request.
        act(() => {
            result.current.start({});
        });
        expect(startCalls).toBe(1);

        act(() => {
            resolveStart?.({
                ok: true,
                status: 200,
                json: () => Promise.resolve({status: "running", host: "127.0.0.1", port: 4000, baseUrl: "http://127.0.0.1:4000", debug: false, repositoryMode: "memory"}),
            });
        });
        await waitFor(() => expect(result.current.state.status).toBe("running"));

        // Once the in-flight request has resolved, the guard releases and a fresh start() works again.
        act(() => {
            result.current.start({});
        });
        expect(startCalls).toBe(2);
    });

    it("spin(): a second call while the first is still in flight is a silent no-op, not a second request", async () => {
        let resolveSpin: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        let spinCalls = 0;
        const fetchImpl: FetchLike = (url) => {
            if (url === "/api/project/runtime/sessions") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({status: "ok", session: {sessionId: "s1", sessionVersion: 1, credits: 100}}),
                });
            }
            if (url === "/api/project/runtime/sessions/s1/spins") {
                spinCalls += 1;
                return new Promise((resolve) => {
                    resolveSpin = resolve;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result} = renderHook(() => useRuntimeManager(), {wrapper: wrapper(fetchImpl)});

        act(() => {
            result.current.createSession();
        });
        await waitFor(() => expect(result.current.sessionId).toBe("s1"));

        act(() => {
            result.current.spin();
        });
        expect(spinCalls).toBe(1);

        act(() => {
            result.current.spin();
        });
        expect(spinCalls).toBe(1);

        act(() => {
            resolveSpin?.({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: {sessionId: "s1", sessionVersion: 2, credits: 90, bet: 10, win: 0}})});
        });
        await waitFor(() => expect(result.current.session.status).toBe("ok"));

        act(() => {
            result.current.spin();
        });
        expect(spinCalls).toBe(2);
    });
});
