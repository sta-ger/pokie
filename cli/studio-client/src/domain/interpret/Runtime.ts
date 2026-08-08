import type {PlaySessionResult, PlaySpinResult, RuntimeSessionResult, RuntimeSpinResult, StartRuntimeResult} from "../../api/apiClient";
import type {StudioRuntimeSessionView, StudioRuntimeStateView} from "../../api/types";

// Pure view-model transforms for the Runtime tab — same role as interpretSimulation.ts/
// interpretReplay.ts: main.ts/dom.ts consume these instead of branching on the raw DTOs themselves,
// and (being pure) these are unit-testable without a real DOM/jsdom. "idle"/"loading" are constructed
// directly by main.ts around the fetch call itself, same convention as every other tab; "error" there
// means the API call itself failed (network/malformed request), distinct from a domain-level outcome
// the server already reports cleanly (not-found/not-running/blocked/conflict).

export type RuntimeStateView = {status: "idle"} | {status: "loading"} | {status: "error"; message: string} | StudioRuntimeStateView;

export function describeRuntimeState(view: StudioRuntimeStateView): RuntimeStateView {
    return view;
}

export function isRuntimeRunning(view: RuntimeStateView): view is Extract<StudioRuntimeStateView, {status: "running"}> {
    return view.status === "running";
}

// startRuntime's own typed "already-running" conflict becomes a view carrying the *currently* running
// state, so the tab can show "already running at ..." instead of a bare error.
export function describeStartResult(result: StartRuntimeResult): RuntimeStateView {
    if (result.status === "already-running") {
        return result.state;
    }
    return result;
}

export type RuntimeSessionResultView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "not-found"; message: string}
    | {status: "not-running"; message: string}
    | {status: "ok"; session: StudioRuntimeSessionView};

export function describeSessionResult(result: RuntimeSessionResult): RuntimeSessionResultView {
    if (result.status === "not-found") {
        return {status: "not-found", message: "Unknown session id."};
    }
    if (result.status === "not-running") {
        return {status: "not-running", message: "Runtime is not running — start it first."};
    }
    return result;
}

export type RuntimeSpinResultView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "not-found"; message: string}
    | {status: "not-running"; message: string}
    | {status: "blocked"; message: string}
    | {status: "conflict"; message: string}
    | {status: "ok"; session: StudioRuntimeSessionView};

export function describeSpinResult(result: RuntimeSpinResult): RuntimeSpinResultView {
    if (result.status === "not-found") {
        return {status: "not-found", message: "Unknown session id."};
    }
    if (result.status === "not-running") {
        return {status: "not-running", message: "Runtime is not running — start it first."};
    }
    return result;
}

// Play's own counterpart to RuntimeSessionResultView/RuntimeSpinResultView above -- same "idle"/
// "loading"/"error" scaffolding, but "no-active-project" (Play's only real precondition — see
// StudioPlayService's own doc comment) in place of "not-running" (there is no server to be running or
// not), and no "conflict" at all (spinPlaySession never sends an expectedVersion — see
// StudioServer.sendPlayErrorResult's own doc comment).
export type PlaySessionResultView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "no-active-project"; message: string}
    | {status: "ok"; session: StudioRuntimeSessionView};

export function describePlaySessionResult(result: PlaySessionResult): PlaySessionResultView {
    if (result.status === "no-active-project") {
        return {status: "no-active-project", message: "No active project — open a project first."};
    }
    return result;
}

export type PlaySpinResultView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string}
    | {status: "not-found"; message: string}
    | {status: "blocked"; message: string}
    | {status: "no-active-project"; message: string}
    | {status: "ok"; session: StudioRuntimeSessionView};

export function describePlaySpinResult(result: PlaySpinResult): PlaySpinResultView {
    if (result.status === "not-found") {
        return {status: "not-found", message: "Unknown session id."};
    }
    if (result.status === "no-active-project") {
        return {status: "no-active-project", message: "No active project — open a project first."};
    }
    return result;
}

// Same cell-formatting convention as interpretReplay.ts's own formatScreenCell — kept as its own copy
// here (Studio's client-side types are each compiled/kept independently, same convention as every
// other type in this project) rather than a shared import.
export function describeRuntimeScreen(screen: unknown[][] | undefined): string[][] | undefined {
    return screen ? screen.map((row) => row.map(formatScreenCell)) : undefined;
}

function formatScreenCell(cell: unknown): string {
    if (typeof cell === "string") {
        return cell;
    }
    if (typeof cell === "number" || typeof cell === "boolean") {
        return String(cell);
    }
    if (cell === null || cell === undefined) {
        return "";
    }
    return JSON.stringify(cell);
}

// The Runtime tab's own "Retry last request" panel needs an honest answer to "what, exactly, would
// retrying send" -- not just a disabled/enabled button. `lastSpin` (the most recent spin actually made
// by useRuntimeManager in *this* Studio session) is the only source that carries the original
// `expectedVersion` alongside the request id, since that value is never persisted server-side onto a
// recorded round -- so a byte-for-byte resend is only ever possible for it. A round picked from history
// instead (any entry in the session's own recentSpins list, including one from *before* this Studio
// session even loaded it) still carries its own `studioRequestId`, which is enough for a genuine
// idempotent replay (the server dedupes purely on (sessionId, requestId), see
// StudioRuntimeManager.recordRecentSpin()'s own doc comment) -- just without the optimistic-locking
// version, which this is honest about rather than fabricating a plausible-looking value.
export type RetryRequestDetail =
    | {status: "unavailable"; reason: string}
    | {
          status: "available";
          sessionId: string;
          requestId: string;
          expectedVersion: number | undefined;
          round: number | undefined;
          recordedAt: string | undefined;
          idempotencyNote: string;
          command: string;
      };

export function describeRetryRequest(params: {
    sessionId: string | undefined;
    baseUrl: string | undefined;
    lastSpin: {requestId?: string; expectedVersion?: number};
    selectedRound: StudioRuntimeSessionView | undefined;
}): RetryRequestDetail {
    const {sessionId, baseUrl, lastSpin, selectedRound} = params;
    if (sessionId === undefined) {
        return {status: "unavailable", reason: "Create or restore a session first."};
    }

    // The literal last spin this Studio session made -- exact, including its original expectedVersion --
    // whenever the selected round agrees with it (or nothing else was ever selected).
    if (lastSpin.requestId !== undefined && (selectedRound === undefined || selectedRound.studioRequestId === lastSpin.requestId)) {
        return {
            status: "available",
            sessionId,
            requestId: lastSpin.requestId,
            expectedVersion: lastSpin.expectedVersion,
            round: selectedRound?.studioRound,
            recordedAt: selectedRound?.studioRecordedAt,
            idempotencyNote:
                lastSpin.expectedVersion === undefined
                    ? "Resending the same request id replays this exact result instead of playing a new round -- no optimistic-locking version was sent with the original request."
                    : `Resending the same request id and expected session version ${lastSpin.expectedVersion} replays this exact result instead of playing a new round.`,
            command: buildSpinCommand(baseUrl, sessionId, lastSpin.requestId, lastSpin.expectedVersion),
        };
    }

    if (selectedRound?.studioRequestId !== undefined) {
        return {
            status: "available",
            sessionId,
            requestId: selectedRound.studioRequestId,
            expectedVersion: undefined,
            round: selectedRound.studioRound,
            recordedAt: selectedRound.studioRecordedAt,
            idempotencyNote:
                "Selected from round history rather than this Studio session's own last spin, so its original optimistic-locking version isn't tracked -- resending its request id still replays this exact round (the server dedupes on request id alone), just without a version check.",
            command: buildSpinCommand(baseUrl, sessionId, selectedRound.studioRequestId, undefined),
        };
    }

    if (selectedRound !== undefined) {
        return {status: "unavailable", reason: "The selected round has no request id on record, so there's nothing to retry -- pick a different round from history below."};
    }

    return {status: "unavailable", reason: "No request has been made yet in this session -- spin a round, or pick one from history below."};
}

function buildSpinCommand(baseUrl: string | undefined, sessionId: string, requestId: string, expectedVersion: number | undefined): string {
    const body: Record<string, unknown> = {requestId};
    if (expectedVersion !== undefined) {
        body.expectedSessionVersion = expectedVersion;
    }
    const url = `${baseUrl ?? "http://<runtime-not-running>"}/sessions/${encodeURIComponent(sessionId)}/spin?debug=1`;
    return `curl -s -X POST '${url}' -H 'Content-Type: application/json' -d '${JSON.stringify(body)}'`;
}

// "Debug this round"'s own honest gate -- distinct reasons for distinct fixes, since "no round selected"
// (pick one below), "the runtime itself never captured trace data" (restart with debug mode on), and "this
// particular round has no trace data on record" (pick a different round, or spin a new one -- restarting
// can't retroactively give an already-recorded round the trace it never captured) call for entirely
// different recovery actions, and conflating them into one generic "can't debug" message would leave the
// user guessing which applies. `canRestartWithDebug` is only ever true for the runtime-wide case --
// restarting fixes nothing about a missing selection nor about a specific round that predates debug mode
// being turned on. The gate itself is keyed off `selectedRound.debug` -- StudioRuntimeSessionView's own
// per-round trace payload -- never off whatever the *currently running* server reports, since a round
// selected from history can predate a later restart that turned debug mode on (see
// StudioRuntimeSessionView's own doc comment: `debug` reflects whether *that round* was captured with
// debug mode on, not whether the server is running with it on right now).
export type DebugAvailability =
    | {status: "ready"; requestId: string; round: number | undefined}
    | {status: "blocked"; reason: string; canRestartWithDebug: boolean};

export function describeDebugAvailability(params: {
    sessionReachable: boolean;
    selectedRound: StudioRuntimeSessionView | undefined;
    debugEnabled: boolean | undefined;
}): DebugAvailability {
    const {sessionReachable, selectedRound, debugEnabled} = params;
    if (!sessionReachable) {
        return {status: "blocked", reason: "Create or restore a session first.", canRestartWithDebug: false};
    }
    if (selectedRound === undefined) {
        return {status: "blocked", reason: "Select a round from history below to debug.", canRestartWithDebug: false};
    }
    if (selectedRound.studioRequestId === undefined) {
        return {status: "blocked", reason: "The selected round has no request id on record, so Replay & Debug can't look it up.", canRestartWithDebug: false};
    }
    if (selectedRound.debug === undefined) {
        if (debugEnabled !== true) {
            return {
                status: "blocked",
                reason: "This runtime was started without debug mode, so rounds carry no internal trace data to inspect.",
                canRestartWithDebug: true,
            };
        }
        return {
            status: "blocked",
            reason:
                "The selected round has no debug trace data on record -- it was likely played before debug mode was turned on for this runtime, and that trace can't be produced retroactively. Spin a new round, or pick a different one from history below.",
            canRestartWithDebug: false,
        };
    }
    return {status: "ready", requestId: selectedRound.studioRequestId, round: selectedRound.studioRound};
}

// Same role as interpretReplay.ts's own ReplayListView — distinguishes "no spins recorded yet this
// runtime instance" from "here's the list". Shared by both the Runtime tab's own "round history for
// this session" and the Replay & Debug tab's "Session Spin" find method, since both read the exact same
// GET /api/project/runtime/spins data (StudioRuntimeManager.listRecentSpins()) — moved here (out of
// ReplayTab.tsx, which only ever needed it because it was the first consumer) now that a second tab
// needs the same type. "loading" (set directly by ProjectDashboardPage's refreshRecentSpins(), not
// constructed here) is what lets a consumer -- notably the Runtime tab's "Debug this round" handoff --
// tell "the fetch hasn't resolved yet" apart from "it resolved and there's genuinely nothing", which
// matters for not flashing a false "not found" while the list is still in flight.
export type RecentSpinsListView = {status: "loading"} | {status: "empty"} | {status: "loaded"; entries: StudioRuntimeSessionView[]};

export function describeRecentSpinsList(entries: StudioRuntimeSessionView[]): RecentSpinsListView {
    return entries.length === 0 ? {status: "empty"} : {status: "loaded", entries};
}

// The known, structural fields of a StudioRuntimeSessionView — everything else is whatever extra public
// data a game's own serializer chose to return (see GameSessionSerializing.getInitialData()/
// getRoundData()), e.g. remaining free spins, reel data, paytable. This is the entire "feature progress"
// story: never a new calculation, just the same public/internal split by field name
// StudioRuntimeManager.buildSessionView() and the Runtime tab's own SessionPanel already apply, pulled
// out as its own pure, testable function so the Inspect-round view can show it as a plain-language
// "Additional round data" table instead of a raw JSON dump.
const KNOWN_SESSION_VIEW_FIELDS = new Set([
    "sessionId",
    "game",
    "credits",
    "bet",
    "win",
    "screen",
    "sessionVersion",
    "studioRequestId",
    "studioRound",
    "studioRecordedAt",
    "studioSource",
    "studioOperation",
    "studioProjectRoot",
    "studioSeed",
    "debug",
]);

export function extractAdditionalRoundFields(session: StudioRuntimeSessionView): Record<string, unknown> {
    const extra: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(session)) {
        if (!KNOWN_SESSION_VIEW_FIELDS.has(key)) {
            extra[key] = value;
        }
    }
    return extra;
}
