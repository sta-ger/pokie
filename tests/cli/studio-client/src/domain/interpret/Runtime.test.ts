import type {RuntimeSessionResult, RuntimeSpinResult, StartRuntimeResult} from "../../../../../../cli/studio-client/src/api/apiClient";
import {
    describeRecentSpinsList,
    describeRuntimeScreen,
    describeRuntimeState,
    describeSessionResult,
    describeSpinResult,
    describeStartResult,
    extractAdditionalRoundFields,
    isRuntimeRunning,
} from "../../../../../../cli/studio-client/src/domain/interpret/Runtime";
import type {StudioRuntimeSessionView, StudioRuntimeStateView} from "../../../../../../cli/studio-client/src/api/types";

const runningState: StudioRuntimeStateView = {
    status: "running",
    host: "127.0.0.1",
    port: 4123,
    baseUrl: "http://127.0.0.1:4123",
    debug: false,
    repositoryMode: "memory",
    startedAt: "2026-01-01T00:00:00.000Z",
};

const session: StudioRuntimeSessionView = {
    sessionId: "session-1",
    game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
    credits: 995,
    bet: 5,
    win: 0,
    sessionVersion: 2,
};

describe("interpretRuntime", () => {
    describe("describeRuntimeState", () => {
        it("passes the server's own state view through unchanged", () => {
            expect(describeRuntimeState({status: "stopped"})).toEqual({status: "stopped"});
            expect(describeRuntimeState(runningState)).toEqual(runningState);
            expect(describeRuntimeState({status: "failed", error: "boom"})).toEqual({status: "failed", error: "boom"});
        });
    });

    describe("isRuntimeRunning", () => {
        it("is true only for status: running", () => {
            expect(isRuntimeRunning(runningState)).toBe(true);
            expect(isRuntimeRunning({status: "stopped"})).toBe(false);
            expect(isRuntimeRunning({status: "starting"})).toBe(false);
            expect(isRuntimeRunning({status: "idle"})).toBe(false);
            expect(isRuntimeRunning({status: "loading"})).toBe(false);
        });
    });

    describe("describeStartResult", () => {
        it("passes a successful/failed start result through unchanged", () => {
            const started: StartRuntimeResult = runningState;
            expect(describeStartResult(started)).toEqual(runningState);

            const failed: StartRuntimeResult = {status: "failed", error: "port busy"};
            expect(describeStartResult(failed)).toEqual(failed);
        });

        it("unwraps 'already-running' into the currently running state", () => {
            const result: StartRuntimeResult = {status: "already-running", state: runningState};

            expect(describeStartResult(result)).toEqual(runningState);
        });
    });

    describe("describeSessionResult", () => {
        it("passes through ok", () => {
            const result: RuntimeSessionResult = {status: "ok", session};
            expect(describeSessionResult(result)).toEqual({status: "ok", session});
        });

        it("maps not-found/not-running/error to a message", () => {
            expect(describeSessionResult({status: "not-found"})).toEqual({status: "not-found", message: "Unknown session id."});
            expect(describeSessionResult({status: "not-running"})).toEqual({
                status: "not-running",
                message: "Runtime is not running — start it first.",
            });
            expect(describeSessionResult({status: "error", message: "disk full"})).toEqual({status: "error", message: "disk full"});
        });
    });

    describe("describeSpinResult", () => {
        it("passes through ok/blocked/conflict/error unchanged", () => {
            const ok: RuntimeSpinResult = {status: "ok", session};
            expect(describeSpinResult(ok)).toEqual(ok);
            expect(describeSpinResult({status: "blocked", message: "insufficient balance"})).toEqual({
                status: "blocked",
                message: "insufficient balance",
            });
            expect(describeSpinResult({status: "conflict", message: "stale version"})).toEqual({
                status: "conflict",
                message: "stale version",
            });
            expect(describeSpinResult({status: "error", message: "boom"})).toEqual({status: "error", message: "boom"});
        });

        it("maps not-found/not-running to a message, same as session results", () => {
            expect(describeSpinResult({status: "not-found"})).toEqual({status: "not-found", message: "Unknown session id."});
            expect(describeSpinResult({status: "not-running"})).toEqual({
                status: "not-running",
                message: "Runtime is not running — start it first.",
            });
        });
    });

    describe("describeRuntimeScreen", () => {
        it("returns undefined for an undefined screen", () => {
            expect(describeRuntimeScreen(undefined)).toBeUndefined();
        });

        it("formats string/number/boolean/null/object cells", () => {
            const screen = [["A", 5, true], [null, undefined, {x: 1}]];

            expect(describeRuntimeScreen(screen)).toEqual([
                ["A", "5", "true"],
                ["", "", '{"x":1}'],
            ]);
        });
    });

    describe("extractAdditionalRoundFields", () => {
        it("omits every known structural field, keeping nothing when there's nothing extra", () => {
            expect(extractAdditionalRoundFields(session)).toEqual({});
        });

        it("passes through whatever extra public fields the game's own serializer returned", () => {
            const rich: StudioRuntimeSessionView = {...session, remainingFreeSpins: 3, paytable: {cherry: 5}};

            expect(extractAdditionalRoundFields(rich)).toEqual({remainingFreeSpins: 3, paytable: {cherry: 5}});
        });

        it("never leaks the known fields (including debug and studioRequestId) even when present", () => {
            const withDebug: StudioRuntimeSessionView = {
                ...session,
                studioRequestId: "req-1",
                debug: {stateAfter: {}, requestId: "req-1"},
                bonusRoundActive: true,
            };

            const extra = extractAdditionalRoundFields(withDebug);

            expect(extra).toEqual({bonusRoundActive: true});
            expect(extra).not.toHaveProperty("debug");
            expect(extra).not.toHaveProperty("studioRequestId");
            expect(extra).not.toHaveProperty("sessionId");
            expect(extra).not.toHaveProperty("game");
            expect(extra).not.toHaveProperty("credits");
            expect(extra).not.toHaveProperty("bet");
            expect(extra).not.toHaveProperty("win");
            expect(extra).not.toHaveProperty("screen");
            expect(extra).not.toHaveProperty("sessionVersion");
        });
    });

    describe("describeRecentSpinsList", () => {
        it("reports empty for no entries", () => {
            expect(describeRecentSpinsList([])).toEqual({status: "empty"});
        });

        it("wraps a non-empty list as loaded, unchanged", () => {
            const entries = [session, {...session, sessionId: "session-2"}];

            expect(describeRecentSpinsList(entries)).toEqual({status: "loaded", entries});
        });
    });
});
