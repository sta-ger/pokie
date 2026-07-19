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

// Note: createSession/loadSession/spin are each individually double-submit-guarded (see
// useDoubleSubmitGuard), so the *same* action can never itself have two calls in flight at once -- a
// stale response can only ever come from racing two *different* actions (e.g. Load Session still
// resolving when the user switches to Create Session, or a Spin still resolving when the user loads a
// different session in the meantime) against the single shared sessionRequestIdRef. That's exactly what
// these tests exercise.
describe("useRuntimeManager - stale-response protection", () => {
    it("discards a slow loadSession response once a createSession call started afterward has already resolved", async () => {
        let resolveLoad: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        const fetchImpl: FetchLike = (url) => {
            if (url === "/api/project/runtime/sessions/session-a") {
                return new Promise((resolve) => {
                    resolveLoad = resolve;
                });
            }
            if (url === "/api/project/runtime/sessions") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({status: "ok", session: {sessionId: "session-new", sessionVersion: 1, credits: 1000}}),
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result} = renderHook(() => useRuntimeManager(), {wrapper: wrapper(fetchImpl)});

        act(() => {
            result.current.loadSession("session-a");
        });
        expect(result.current.session.status).toBe("loading");

        act(() => {
            result.current.createSession();
        });
        await waitFor(() => expect(result.current.sessionId).toBe("session-new"));

        // The slow loadSession("session-a") response finally lands -- must never overwrite the
        // already-shown, newer createSession() result.
        act(() => {
            resolveLoad?.({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: {sessionId: "session-a", sessionVersion: 1, credits: 500}})});
        });
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

        expect(result.current.sessionId).toBe("session-new");
        expect(result.current.session.status === "ok" && result.current.session.session.sessionId).toBe("session-new");
    });

    it("discards a slow spin response once a different session has been loaded in the meantime", async () => {
        let resolveSpin: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        const fetchImpl: FetchLike = (url) => {
            if (url === "/api/project/runtime/sessions") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({status: "ok", session: {sessionId: "session-a", sessionVersion: 1, credits: 100}}),
                });
            }
            if (url === "/api/project/runtime/sessions/session-a/spins") {
                return new Promise((resolve) => {
                    resolveSpin = resolve;
                });
            }
            if (url === "/api/project/runtime/sessions/session-b") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () => Promise.resolve({status: "ok", session: {sessionId: "session-b", sessionVersion: 1, credits: 200}}),
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result} = renderHook(() => useRuntimeManager(), {wrapper: wrapper(fetchImpl)});

        act(() => {
            result.current.createSession();
        });
        await waitFor(() => expect(result.current.sessionId).toBe("session-a"));

        act(() => {
            result.current.spin();
        });
        expect(result.current.session.status).toBe("loading");

        act(() => {
            result.current.loadSession("session-b");
        });
        await waitFor(() => expect(result.current.sessionId).toBe("session-b"));

        // The slow spin() response against session-a finally lands -- must never overwrite session-b's
        // already-loaded view.
        act(() => {
            resolveSpin?.({
                ok: true,
                status: 200,
                json: () => Promise.resolve({status: "ok", session: {sessionId: "session-a", sessionVersion: 2, credits: 90, bet: 10, win: 0}}),
            });
        });
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

        expect(result.current.sessionId).toBe("session-b");
        expect(result.current.session.status === "ok" && result.current.session.session.sessionId).toBe("session-b");
    });

    it("resetForProjectSwitch() clears session/sessionId/history and discards a response still in flight", async () => {
        let resolveLoad: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        const fetchImpl: FetchLike = (url) => {
            if (url === "/api/project/runtime/sessions/session-a") {
                return new Promise((resolve) => {
                    resolveLoad = resolve;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result} = renderHook(() => useRuntimeManager(), {wrapper: wrapper(fetchImpl)});

        act(() => {
            result.current.loadSession("session-a");
        });
        expect(result.current.session.status).toBe("loading");

        act(() => {
            result.current.resetForProjectSwitch();
        });
        expect(result.current.sessionId).toBeUndefined();
        expect(result.current.session).toEqual({status: "idle"});
        expect(result.current.history).toEqual([]);

        // The project-A session response finally lands after the switch -- must never repopulate what
        // the reset just cleared.
        act(() => {
            resolveLoad?.({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: {sessionId: "session-a", sessionVersion: 1, credits: 500}})});
        });
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

        expect(result.current.sessionId).toBeUndefined();
        expect(result.current.session).toEqual({status: "idle"});
    });

    // `state` (the runtime server's own host/port/baseUrl/repositoryMode) is shared across
    // refresh()/start()/stop()/restart() -- unlike session state, none of the four had any stale-
    // response protection at all, so a manual Refresh still in flight when Start is clicked could have
    // its slower "stopped" response land *after* Start's "running" one and silently overwrite it.
    it("discards a slow refresh() response once start() has already resolved afterward", async () => {
        let resolveRefresh: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/runtime" && init === undefined) {
                return new Promise((resolve) => {
                    resolveRefresh = resolve;
                });
            }
            if (url === "/api/project/runtime/start") {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    json: () =>
                        Promise.resolve({
                            status: "running",
                            host: "127.0.0.1",
                            port: 4123,
                            baseUrl: "http://127.0.0.1:4123",
                            debug: false,
                            repositoryMode: "memory",
                            startedAt: "2026-01-01T00:00:00.000Z",
                        }),
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        const {result} = renderHook(() => useRuntimeManager(), {wrapper: wrapper(fetchImpl)});

        act(() => {
            result.current.refresh();
        });
        expect(result.current.state.status).toBe("loading");

        act(() => {
            result.current.start({});
        });
        await waitFor(() => expect(result.current.state.status).toBe("running"));

        // The slow refresh() response finally lands -- must never overwrite the already-running state
        // Start's own (later, actually-current) response already produced.
        act(() => {
            resolveRefresh?.({ok: true, status: 200, json: () => Promise.resolve({status: "stopped"})});
        });
        await new Promise((resolve) => {
            setTimeout(resolve, 0);
        });

        expect(result.current.state.status).toBe("running");
        expect(result.current.running).toBe(true);
    });
});
