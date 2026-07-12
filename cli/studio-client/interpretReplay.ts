import type {ReplayDescriptor, StudioReplayListEntry, StudioReplayRecordView} from "./types.js";

// Pure view-model transforms for the Replay tab — same role as interpretSimulation.ts/interpretReports.ts:
// main.ts/dom.ts consume these instead of branching on the raw descriptor/list shapes themselves, and
// (being pure) these are unit-testable without a real DOM/jsdom.

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

export function describeReplayResult(record: StudioReplayRecordView): ReplayResultView {
    const descriptor: ReplayDescriptor = record.descriptor;
    return {
        id: record.id,
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
