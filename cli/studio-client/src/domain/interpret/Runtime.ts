import type {PlaySessionResult, PlaySpinResult} from "../../api/apiClient";
import type {StudioRuntimeSessionView} from "../../api/types";

// Pure view-model transforms for a Studio round — same role as interpretSimulation.ts/interpretReplay.ts:
// main.ts/dom.ts consume these instead of branching on the raw DTOs themselves, and (being pure) these
// are unit-testable without a real DOM/jsdom. "idle"/"loading" are constructed directly by main.ts
// around the fetch call itself, same convention as every other tab; "error" there means the API call
// itself failed (network/malformed request), distinct from a domain-level outcome the server already
// reports cleanly.

// Play's own "idle"/"loading"/"error" scaffolding, plus "no-active-project" (Play's only real
// precondition — see StudioPlayService's own doc comment), and no "conflict" at all (spinPlaySession
// never sends an expectedVersion — see StudioServer.sendPlayErrorResult's own doc comment).
export type PlaySessionResultView =
    | {status: "idle"}
    | {status: "loading"}
    | {status: "error"; message: string; subject?: string}
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
    | {status: "error"; message: string; subject?: string}
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

// Same role as interpretReplay.ts's own ReplayListView — distinguishes "no spins recorded yet" from
// "here's the list". Backs the Replay & Debug tab's own "Session Spin" find method, which reads the
// shared GET /api/project/rounds data (StudioRoundRecorder.list()). "loading" (set directly by
// ProjectDashboardPage's refreshRecentSpins(), not constructed here) is what lets a consumer tell "the
// fetch hasn't resolved yet" apart from "it resolved and there's genuinely nothing", which matters for
// not flashing a false "not found" while the list is still in flight.
export type RecentSpinsListView = {status: "loading"} | {status: "empty"} | {status: "loaded"; entries: StudioRuntimeSessionView[]};

export function describeRecentSpinsList(entries: StudioRuntimeSessionView[]): RecentSpinsListView {
    return entries.length === 0 ? {status: "empty"} : {status: "loaded", entries};
}

// The known, structural fields of a StudioRuntimeSessionView — everything else is whatever extra public
// data a game's own serializer chose to return (see GameSessionSerializing.getInitialData()/
// getRoundData()), e.g. remaining free spins, reel data, paytable. This is the entire "feature progress"
// story: never a new calculation, just the same public/internal split by field name
// StudioPlayService.buildSessionView() already applies, pulled out as its own pure, testable function so
// the Inspect-round view can show it as a plain-language "Additional round data" table instead of a raw
// JSON dump.
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
