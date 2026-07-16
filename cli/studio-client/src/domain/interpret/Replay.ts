import type {ReplayDescriptor, StudioReplayJobView, StudioReplayListEntry} from "../../api/types";

// Pure view-model transforms for the Replay tab — same role as interpretSimulation.ts: main.ts/dom.ts
// consume these instead of branching on the raw job/list shapes themselves, and (being pure) these are
// unit-testable without a real DOM/jsdom.

export type ReplayProgressView = {
    status: StudioReplayJobView["status"];
    completedRounds: number;
    round: number;
    percent: number;
    durationMs: number;
    // Only ever set when status === "failed" — the job's own safe error message (see
    // StudioReplayExecutionService), not an API-call failure (those are rendered separately by
    // main.ts's own catch handling around each apiClient call).
    error?: string;
};

export function describeReplayProgress(job: StudioReplayJobView): ReplayProgressView {
    const percent = job.round > 0 ? Math.min(100, Math.round((job.completedRounds / job.round) * 100)) : 0;
    return {
        status: job.status,
        completedRounds: job.completedRounds,
        round: job.round,
        percent,
        durationMs: job.durationMs,
        error: job.error,
    };
}

export function isReplayActive(job: StudioReplayJobView): boolean {
    return job.status === "queued" || job.status === "running";
}

export function isReplayTerminal(job: StudioReplayJobView): boolean {
    return job.status === "completed" || job.status === "failed" || job.status === "cancelled";
}

export type ReplayResultView = {
    id: string;
    game: {id: string; name: string; version: string};
    round: number;
    seed: string | null;
    totalBet: number;
    totalWin: number;
    // Cell-level display strings, row-major, or undefined for a session without
    // getSymbolsCombination() (ReplayDescriptor.screen === null — see ReplayRecorder's own doc
    // comment) — dom.ts renders this as "no screen available" rather than an empty grid.
    screen?: string[][];
    timestamp: number;
    durationMs: number;
};

// Only meaningful for a completed job (job.descriptor is defined) — callers only call this once
// isReplayTerminal(job) && job.status === "completed", same as describeSimulationReport only ever
// being called for a completed job's report.
export function describeReplayResult(job: StudioReplayJobView): ReplayResultView | undefined {
    if (!job.descriptor) {
        return undefined;
    }
    const descriptor: ReplayDescriptor = job.descriptor;
    return {
        id: job.id,
        game: descriptor.game,
        round: descriptor.round,
        seed: descriptor.seed,
        totalBet: descriptor.totalBet,
        totalWin: descriptor.totalWin,
        screen: descriptor.screen ? descriptor.screen.map((row) => row.map(formatScreenCell)) : undefined,
        timestamp: descriptor.timestamp,
        durationMs: descriptor.durationMs,
    };
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

// Same role as interpretReports.ts's ReportListView — distinguishes "no replays run yet" from "here's
// the list"; "loading"/"error" are constructed directly by main.ts around the fetch call itself, same
// convention as every other list in this app.
export type ReplayListView = {status: "empty"} | {status: "loaded"; entries: StudioReplayListEntry[]};

export function describeReplayList(entries: StudioReplayListEntry[]): ReplayListView {
    return entries.length === 0 ? {status: "empty"} : {status: "loaded", entries};
}
