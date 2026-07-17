import type {ReplayDescriptor, RoundArtifactJson, StudioReplayJobView, StudioReplayListEntry} from "../../api/types";

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

// A RoundArtifactJson with every screen (round-level and each step's own) pre-formatted to display
// strings via formatScreenCell, ready for ScreenTable — everything else (wins, feature events,
// provenance, hash, debug) passes through as-is, since it's already the exact JSON-safe shape the
// Inspect step needs.
export type RoundArtifactDisplayView = Omit<RoundArtifactJson, "screen" | "steps"> & {
    screen: string[][];
    steps: (Omit<RoundArtifactJson["steps"][number], "screen"> & {screen: string[][]})[];
};

export function describeRoundArtifact(artifact: RoundArtifactJson): RoundArtifactDisplayView {
    return {
        ...artifact,
        screen: formatScreenGrid(artifact.screen),
        steps: artifact.steps.map((step) => ({...step, screen: formatScreenGrid(step.screen)})),
    };
}

function formatScreenGrid(screen: readonly (readonly (string | number)[])[]): string[][] {
    return screen.map((row) => row.map(formatScreenCell));
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
    // Only present for a replay of a video-slot game (see StudioReplayExecutionService.buildArtifact())
    // — the rich per-step/wins/feature-events/provenance record the Inspect step's
    // RoundArtifactInspector renders. Absent for anything else, same "no screen available" fallback.
    artifact?: RoundArtifactDisplayView;
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
        artifact: descriptor.artifact ? describeRoundArtifact(descriptor.artifact) : undefined,
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

// Requirement 4 of the Replay & Debug slice: an explicit match/mismatch verdict between a known-good
// "expected" artifact (a pasted/selected Replay Artifact, or a previous Recent Replays entry) and a
// freshly reproduced one for the same seed/round. The artifact's own content hash (computed
// server-side by PokieJsonRoundArtifactProjector, from a deterministic roundId — see
// StudioReplayExecutionService.buildArtifact()) is the actual source of truth for "matches"; the
// per-field differences below are presentation only, a plain comparison of two already-computed JSON
// values (never a recomputation of game logic), just to explain *what* differs on a mismatch.
export type ReplayComparisonView = {matches: boolean; differences: string[]};

export function describeReplayComparison(expected: RoundArtifactJson, reproduced: RoundArtifactJson): ReplayComparisonView {
    if (expected.hash === reproduced.hash) {
        return {matches: true, differences: []};
    }

    const differences: string[] = [];
    if (!screensEqual(expected.screen, reproduced.screen)) {
        differences.push("Screen differs.");
    }
    if (expected.totalWin !== reproduced.totalWin) {
        differences.push(`Total win differs (expected ${expected.totalWin}, got ${reproduced.totalWin}).`);
    }
    if (expected.payoutMultiplier !== reproduced.payoutMultiplier) {
        differences.push(`Payout multiplier differs (expected ${expected.payoutMultiplier}, got ${reproduced.payoutMultiplier}).`);
    }
    if (expected.wins.length !== reproduced.wins.length) {
        differences.push(`Win count differs (expected ${expected.wins.length}, got ${reproduced.wins.length}).`);
    }
    if (differences.length === 0) {
        differences.push("Content differs in a field not covered by this summary — see Advanced details for the full JSON.");
    }
    return {matches: false, differences};
}

function screensEqual(a: readonly (readonly (string | number)[])[], b: readonly (readonly (string | number)[])[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    return a.every((row, rowIndex) => {
        const otherRow = b[rowIndex];
        return row.length === otherRow.length && row.every((cell, cellIndex) => cell === otherRow[cellIndex]);
    });
}

// Same role as interpretReports.ts's ReportListView — distinguishes "no replays run yet" from "here's
// the list"; "loading"/"error" are constructed directly by main.ts around the fetch call itself, same
// convention as every other list in this app.
export type ReplayListView = {status: "empty"} | {status: "loaded"; entries: StudioReplayListEntry[]};

export function describeReplayList(entries: StudioReplayListEntry[]): ReplayListView {
    return entries.length === 0 ? {status: "empty"} : {status: "loaded", entries};
}
