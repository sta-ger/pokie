import type {RuntimeSessionResult, RuntimeSpinResult, StartRuntimeResult} from "../../api/apiClient";
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
