import {act, renderHook, waitFor} from "@testing-library/react";
import {StrictMode, type ReactNode} from "react";
import type {FetchLike} from "../../../../../cli/studio-client/src/api/apiClient";
import type {StudioRuntimeSessionView} from "../../../../../cli/studio-client/src/api/types";
import {StudioApiProvider} from "../../../../../cli/studio-client/src/context/StudioApiProvider";
import {usePlaySession} from "../../../../../cli/studio-client/src/hooks/usePlaySession";

const GAME = {id: "fixture-slot", name: "Fixture Slot", version: "1.0.0"};

function session(sessionId: string, overrides: Partial<StudioRuntimeSessionView> = {}): StudioRuntimeSessionView {
    return {sessionId, game: GAME, credits: 1000, bet: 1, ...overrides};
}

function strictModeWrapper(fetchImpl: FetchLike) {
    return function Wrapper({children}: {children: ReactNode}) {
        return <StrictMode><StudioApiProvider fetchImpl={fetchImpl}>{children}</StudioApiProvider></StrictMode>;
    };
}

describe("usePlaySession - resetForProjectSwitch", () => {
    it("discards a pending new-session response after a project switch", async () => {
        let release: (() => void) | undefined;
        const fetchImpl: FetchLike = () => new Promise((resolve) => {
            release = () => resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: session("stale-session")})});
        });
        const onRoundRecorded = jest.fn();
        const {result} = renderHook(() => usePlaySession(onRoundRecorded), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.newSession());
        expect(result.current.session.status).toBe("loading");
        act(() => result.current.resetForProjectSwitch());
        act(() => release?.());

        await waitFor(() => expect(result.current.session).toEqual({status: "idle"}));
        expect(result.current.sessionId).toBeUndefined();
        expect(onRoundRecorded).not.toHaveBeenCalled();
    });

    it("discards a pending round and recorder refresh after a project switch", async () => {
        let releaseSpin: (() => void) | undefined;
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/play/session") {
                return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: session("old-session")})});
            }
            if (url === "/api/project/play/sessions/old-session/spin" && init?.method === "POST") {
                return new Promise((resolve) => {
                    releaseSpin = () => resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: session("old-session", {win: 25, screen: [["stale-win"]]})})});
                });
            }
            return Promise.reject(new Error(`Unexpected request ${url}`));
        };
        const onRoundRecorded = jest.fn();
        const {result} = renderHook(() => usePlaySession(onRoundRecorded), {wrapper: strictModeWrapper(fetchImpl)});

        act(() => result.current.newSession());
        await waitFor(() => expect(result.current.sessionId).toBe("old-session"));
        act(() => result.current.spin());
        await waitFor(() => expect(releaseSpin).toBeDefined());
        act(() => result.current.resetForProjectSwitch());
        act(() => releaseSpin?.());

        await waitFor(() => expect(result.current.session).toEqual({status: "idle"}));
        expect(result.current.sessionId).toBeUndefined();
        expect(onRoundRecorded).not.toHaveBeenCalled();
    });
});
