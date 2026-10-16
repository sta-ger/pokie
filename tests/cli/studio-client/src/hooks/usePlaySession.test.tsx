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

describe("usePlaySession - canonical runtime failures", () => {
    it.each([
        ["invalid-command", 400, "Check the command"],
        ["incompatible-state", 409, "matching game version"],
        ["corrupt-state", 409, "valid backup"],
        ["restoration-unsupported", 409, "original live runtime"],
        ["storage-error", 503, "storage availability"],
        ["recovery-required", 409, "Reconcile"],
    ])("retains the settled view and does not reset or retry %s", async (code, status, guidance) => {
        let creations = 0;
        let spins = 0;
        const settled = session("stable", {win: 3, screen: [["A"]]});
        const fetchImpl: FetchLike = url => {
            if (url === "/api/project/play/session") {
                creations++;
                return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: settled})});
            }
            spins++;
            return Promise.resolve({ok: false, status: Number(status), json: () => Promise.resolve({code, error: "Saved rejection"})});
        };
        const onRoundRecorded = jest.fn();
        const {result} = renderHook(() => usePlaySession(onRoundRecorded), {wrapper: strictModeWrapper(fetchImpl)});
        act(() => result.current.newSession());
        await waitFor(() => expect(result.current.sessionId).toBe("stable"));
        act(() => result.current.spin());
        await waitFor(() => expect(result.current.session).toMatchObject({status: "error", previousSession: settled, message: expect.stringContaining(String(guidance))}));
        expect(result.current.sessionId).toBe("stable");
        expect(creations).toBe(1);
        expect(spins).toBe(1);
        expect(onRoundRecorded).not.toHaveBeenCalled();
    });
});

it("keeps the same entry identity after response loss and then sends the saved delivery token, not its mathematical cursor", async () => {
    const bodies: Record<string, unknown>[] = [];
    const {boundedPlayChain} = await import("../../../studio/runtime/fixtures/boundedPlayChain");
    const pending = (await boundedPlayChain("cascade-respins-collection", 26))[1].logicalRound!;
    expect(pending).toMatchObject({cursor: 2, mathematicalCursor: 1, status: "pending"});
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/project/play/session") return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: session("stable", {logicalRoundDeliverySupported: true})})});
        bodies.push(JSON.parse(String(init?.body)));
        if (bodies.length === 1) return Promise.reject(new Error("Published response lost"));
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: session("stable", {logicalRoundDeliverySupported: true, logicalRound: pending})})});
    };
    const {result} = renderHook(() => usePlaySession(), {wrapper: strictModeWrapper(fetchImpl)});
    act(() => result.current.newSession());
    await waitFor(() => expect(result.current.sessionId).toBe("stable"));
    act(() => result.current.spin(1, "buy", "stepwise"));
    await waitFor(() => expect(result.current.session.status).toBe("error"));
    act(() => result.current.spin(7.5, "base", "composite"));
    await waitFor(() => expect(result.current.session.status).toBe("ok"));
    expect(bodies[1]).toEqual(bodies[0]);
    act(() => result.current.spin(7.5, "buy"));
    await waitFor(() => expect(bodies).toHaveLength(3));
    expect(bodies[2]).toMatchObject({delivery: "stepwise", continuation: {roundId: pending.roundId, cursor: 2}});
    expect(bodies[2]).not.toHaveProperty("bet");
    expect(bodies[2]).not.toHaveProperty("mode");
    await waitFor(() => expect(result.current.session.status).toBe("ok"));
});

it.each(["invalid-command", "blocked"])("releases a definitively rejected %s intent so changed controls submit a fresh entry", async code => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/project/play/session") return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: session("stable", {logicalRoundDeliverySupported: true})})});
        bodies.push(JSON.parse(String(init?.body)));
        if (bodies.length === 1) return Promise.resolve({ok: false, status: 400, json: () => Promise.resolve({code, error: "Rejected selection", retryDisposition: "rejected"})});
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: session("stable", {logicalRoundDeliverySupported: true})})});
    };
    const {result} = renderHook(() => usePlaySession(), {wrapper: strictModeWrapper(fetchImpl)});
    act(() => result.current.newSession());
    await waitFor(() => expect(result.current.sessionId).toBe("stable"));
    act(() => result.current.spin(7.5, "buy"));
    await waitFor(() => expect(result.current.session.status).toBe("error"));
    act(() => result.current.spin(0.05, "base", "composite"));
    await waitFor(() => expect(result.current.session.status).toBe("ok"));
    expect(bodies[1]).toMatchObject({bet: 0.05, mode: "base", delivery: "composite"});
    expect(bodies[1].requestId).not.toBe(bodies[0].requestId);
    expect(bodies[1].roundId).not.toBe(bodies[0].roundId);
});

it.each(["recovery-required", "settlement-error"])("retains the original intent after uncertain %s", async code => {
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/project/play/session") return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: session("stable", {logicalRoundDeliverySupported: true})})});
        bodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve({ok: false, status: 409, json: () => Promise.resolve({code, error: "Uncertain settlement"})});
    };
    const {result} = renderHook(() => usePlaySession(), {wrapper: strictModeWrapper(fetchImpl)});
    act(() => result.current.newSession());
    await waitFor(() => expect(result.current.sessionId).toBe("stable"));
    act(() => result.current.spin(7.5, "buy"));
    await waitFor(() => expect(result.current.session.status).toBe("error"));
    act(() => result.current.spin(0.05, "base", "composite"));
    await waitFor(() => expect(bodies).toHaveLength(2));
    await waitFor(() => expect(result.current.session.status).toBe("error"));
    expect(bodies[1]).toEqual(bodies[0]);
});

it("shows a committed prefix on successor error while retaining the original intent for retry", async () => {
    const bodies: Record<string, unknown>[] = [];
    const prefix = session("stable", {credits: 999, logicalRoundDeliverySupported: true});
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/project/play/session") return Promise.resolve({ok: true, status: 201, json: () => Promise.resolve({status: "ok", session: session("stable", {logicalRoundDeliverySupported: true})})});
        bodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve({ok: false, status: 503, json: () => Promise.resolve({code: "execution-error", error: "Successor failed", committedProgress: {roundId: "round", cursor: 1, requestId: "entry", nextRequestId: "entry:subround:1"}, session: prefix})});
    };
    const recorded = jest.fn();
    const {result} = renderHook(() => usePlaySession(recorded), {wrapper: strictModeWrapper(fetchImpl)});
    act(() => result.current.newSession());
    await waitFor(() => expect(result.current.sessionId).toBe("stable"));
    act(() => result.current.spin(7.5, "buy", "composite"));
    await waitFor(() => expect(result.current.session).toMatchObject({status: "error", previousSession: prefix}));
    expect(recorded).toHaveBeenCalledTimes(1);
    act(() => result.current.spin(0.05, "base"));
    await waitFor(() => expect(bodies).toHaveLength(2));
    await waitFor(() => expect(result.current.session.status).toBe("error"));
    expect(bodies[1]).toEqual(bodies[0]);
});

it("continues a restored pending feature using its saved public delivery cursor", async () => {
    const {boundedPlayChain} = await import("../../../studio/runtime/fixtures/boundedPlayChain");
    const logicalRound = (await boundedPlayChain("cascade-respins-collection", 26))[1].logicalRound!;
    const restored = session("restored", {logicalRoundDeliverySupported: true, logicalRound});
    const bodies: Record<string, unknown>[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        if (url.endsWith("/restore")) return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: restored})});
        bodies.push(JSON.parse(String(init?.body)));
        return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "ok", session: restored})});
    };
    const {result} = renderHook(() => usePlaySession(), {wrapper: strictModeWrapper(fetchImpl)});
    act(() => result.current.restore({checkpoint: "validated by Worker"}));
    await waitFor(() => expect(result.current.sessionId).toBe("restored"));
    act(() => result.current.spin(7.5, "buy", "composite"));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({requestId: expect.any(String), delivery: "composite", continuation: {roundId: logicalRound.roundId, cursor: logicalRound.cursor}});
    expect(bodies[0]).not.toHaveProperty("roundId");
    expect(bodies[0]).not.toHaveProperty("bet");
});
