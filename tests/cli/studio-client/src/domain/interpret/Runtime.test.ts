import type {RuntimeSessionResult, RuntimeSpinResult, StartRuntimeResult} from "../../../../../../cli/studio-client/src/api/apiClient";
import {
    describeDebugAvailability,
    describeRecentSpinsList,
    describeRetryRequest,
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
    game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
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

        it("never leaks the known fields (including debug, studioRequestId, and the recent-spin identity bookkeeping) even when present", () => {
            const withDebug: StudioRuntimeSessionView = {
                ...session,
                studioRequestId: "req-1",
                studioRound: 3,
                studioRecordedAt: "2026-07-29T00:00:00.000Z",
                studioSource: "live",
                debug: {stateAfter: {}, requestId: "req-1"},
                bonusRoundActive: true,
            };

            const extra = extractAdditionalRoundFields(withDebug);

            expect(extra).toEqual({bonusRoundActive: true});
            expect(extra).not.toHaveProperty("debug");
            expect(extra).not.toHaveProperty("studioRequestId");
            expect(extra).not.toHaveProperty("studioRound");
            expect(extra).not.toHaveProperty("studioRecordedAt");
            expect(extra).not.toHaveProperty("studioSource");
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

    describe("describeRetryRequest", () => {
        it("is unavailable when there's no session at all", () => {
            expect(describeRetryRequest({sessionId: undefined, baseUrl: undefined, lastSpin: {}, selectedRound: undefined})).toEqual({
                status: "unavailable",
                reason: "Create or restore a session first.",
            });
        });

        it("is unavailable, with an explanation, when a session exists but nothing has been spun or selected", () => {
            const result = describeRetryRequest({sessionId: "session-1", baseUrl: "http://127.0.0.1:4123", lastSpin: {}, selectedRound: undefined});

            expect(result).toEqual({
                status: "unavailable",
                reason: "No request has been made yet in this session -- spin a round, or pick one from history below.",
            });
        });

        it("uses this Studio session's own last spin -- exact requestId/expectedVersion -- when nothing else is selected", () => {
            const result = describeRetryRequest({
                sessionId: "session-1",
                baseUrl: "http://127.0.0.1:4123",
                lastSpin: {requestId: "req-1", expectedVersion: 3},
                selectedRound: undefined,
            });

            expect(result.status).toBe("available");
            if (result.status !== "available") {
                return;
            }
            expect(result.requestId).toBe("req-1");
            expect(result.expectedVersion).toBe(3);
            expect(result.command).toContain("http://127.0.0.1:4123/sessions/session-1/spin?debug=1");
            expect(result.command).toContain('"requestId":"req-1"');
            expect(result.command).toContain('"expectedSessionVersion":3');
            expect(result.idempotencyNote).toMatch(/expected session version 3/);
        });

        it("still uses the last spin's exact detail when the selected round is that same round", () => {
            const result = describeRetryRequest({
                sessionId: "session-1",
                baseUrl: "http://127.0.0.1:4123",
                lastSpin: {requestId: "req-1", expectedVersion: 3},
                selectedRound: {...session, studioRequestId: "req-1", studioRound: 2},
            });

            expect(result.status).toBe("available");
            if (result.status !== "available") {
                return;
            }
            expect(result.expectedVersion).toBe(3);
            expect(result.round).toBe(2);
        });

        it("falls back to a history-selected round's own request id, honestly noting the missing expectedVersion", () => {
            const result = describeRetryRequest({
                sessionId: "session-1",
                baseUrl: "http://127.0.0.1:4123",
                lastSpin: {requestId: "req-current", expectedVersion: 5},
                selectedRound: {...session, studioRequestId: "req-older", studioRound: 1, studioRecordedAt: "2026-07-29T00:00:00.000Z"},
            });

            expect(result).toEqual({
                status: "available",
                sessionId: "session-1",
                requestId: "req-older",
                expectedVersion: undefined,
                round: 1,
                recordedAt: "2026-07-29T00:00:00.000Z",
                idempotencyNote: expect.stringContaining("optimistic-locking version isn't tracked"),
                command: expect.stringContaining('"requestId":"req-older"'),
            });
            if (result.status === "available") {
                expect(result.command).not.toContain("expectedSessionVersion");
            }
        });

        it("is unavailable when the selected round has no request id on record", () => {
            const result = describeRetryRequest({
                sessionId: "session-1",
                baseUrl: "http://127.0.0.1:4123",
                lastSpin: {},
                selectedRound: {...session, studioRequestId: undefined},
            });

            expect(result).toEqual({
                status: "unavailable",
                reason: "The selected round has no request id on record, so there's nothing to retry -- pick a different round from history below.",
            });
        });
    });

    describe("describeDebugAvailability", () => {
        it("is blocked when there's no session", () => {
            expect(describeDebugAvailability({sessionReachable: false, selectedRound: undefined, debugEnabled: true})).toEqual({
                status: "blocked",
                reason: "Create or restore a session first.",
                canRestartWithDebug: false,
            });
        });

        it("is blocked, offering no restart, when no round is selected", () => {
            expect(describeDebugAvailability({sessionReachable: true, selectedRound: undefined, debugEnabled: true})).toEqual({
                status: "blocked",
                reason: "Select a round from history below to debug.",
                canRestartWithDebug: false,
            });
        });

        it("is blocked, offering no restart, when the selected round has no request id on record", () => {
            expect(
                describeDebugAvailability({sessionReachable: true, selectedRound: {...session, studioRequestId: undefined}, debugEnabled: true}),
            ).toEqual({
                status: "blocked",
                reason: "The selected round has no request id on record, so Replay & Debug can't look it up.",
                canRestartWithDebug: false,
            });
        });

        it("offers a restart-with-debug recovery action when a round is selected but debug mode is off", () => {
            expect(
                describeDebugAvailability({
                    sessionReachable: true,
                    selectedRound: {...session, studioRequestId: "req-1"},
                    debugEnabled: false,
                }),
            ).toEqual({
                status: "blocked",
                reason: "This runtime was started without debug mode, so rounds carry no internal trace data to inspect.",
                canRestartWithDebug: true,
            });
        });

        it("is blocked, offering no restart, when the runtime is debug-enabled but the selected round itself has no trace data -- e.g. it predates a later restart into debug mode", () => {
            expect(
                describeDebugAvailability({
                    sessionReachable: true,
                    selectedRound: {...session, studioRequestId: "req-1", studioRound: 4},
                    debugEnabled: true,
                }),
            ).toEqual({
                status: "blocked",
                reason:
                    "The selected round has no debug trace data on record -- it was likely played before debug mode was turned on for this runtime, and that trace can't be produced retroactively. Spin a new round, or pick a different one from history below.",
                canRestartWithDebug: false,
            });
        });

        it("is ready once a round with its own trace data is selected, regardless of whether the current runtime happens to report debug mode on", () => {
            expect(
                describeDebugAvailability({
                    sessionReachable: true,
                    selectedRound: {...session, studioRequestId: "req-1", studioRound: 4, debug: {stateAfter: {}, requestId: "req-1"}},
                    debugEnabled: false,
                }),
            ).toEqual({status: "ready", requestId: "req-1", round: 4});
        });
    });
});
