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
    // Serialized session state immediately before/after the target round's play() — opaque, rendered
    // as-is by RoundArtifactInspector (never parsed/reconstructed on the frontend). Absent whenever the
    // game/session doesn't support state serialization or capture failed server-side (see
    // ReplayDescriptor's own doc comment) — the Inspector shows an explicit "unavailable" message for
    // that case rather than silently omitting the section.
    stateBefore?: unknown;
    stateAfter?: unknown;
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
        stateBefore: descriptor.stateBefore,
        stateAfter: descriptor.stateAfter,
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

// Requirement 4 of the Replay & Debug stabilization pass: a capability-aware verdict between a
// known-good "expected" artifact (a pasted/selected Replay Artifact, or a previous Recent Replays entry)
// and a freshly reproduced one for the same seed/round. Every dimension is compared independently and
// defensively — a missing/malformed field on either side makes *that dimension* "unavailable", never a
// thrown exception and never silently folded into either a match or a mismatch (see
// describeReplayComparison's own doc comment for why the artifact's content hash is no longer used as a
// blanket match shortcut).
export type ComparisonDimensionResult =
    | {status: "match"}
    | {status: "mismatch"; detail: string}
    | {status: "unavailable"; reason: string};

export type ReplayComparisonDimensions = {
    screen: ComparisonDimensionResult;
    wins: ComparisonDimensionResult;
    totalPayout: ComparisonDimensionResult;
    steps: ComparisonDimensionResult;
    featureEvents: ComparisonDimensionResult;
    state: ComparisonDimensionResult;
    rngReelStops: ComparisonDimensionResult;
};

export type ReplayComparisonView = {
    // "unavailable": the expected side itself is too malformed/absent to compare on any dimension at
    // all — see the two early-return checks in describeReplayComparison below.
    // "match": every dimension that could be compared matched.
    // "partial": every *available* dimension matched, but at least one (typically state/rngReelStops,
    // which are only ever captured best-effort) was unavailable on one side and so was skipped — never
    // conflated with a real game-result mismatch.
    // "mismatch": at least one available dimension didn't match.
    status: "match" | "mismatch" | "partial" | "unavailable";
    unavailableReason?: string;
    dimensions: ReplayComparisonDimensions;
};

// What describeReplayComparison needs from each side — a slice of ReplayDescriptor (or the pasted
// artifact's own inspection result), not the full StudioReplayJobView/ExpectedReplayState shapes those
// actually live in at the call site (ProjectDashboardPage.tsx), keeping this module decoupled from that
// tab's own view-model types.
export type ComparableReplayResult = {
    artifact?: RoundArtifactJson;
    // Non-empty when the server's RoundArtifactValidator flagged the "expected" side's nested artifact
    // as structurally malformed (see StudioServer.handleInspectReplayArtifact) — round/seed alone can
    // still be valid enough to attempt a replay even when this is non-empty (the two-tier split
    // requirement 1 asks for), but the artifact itself is never trustworthy enough to compare against.
    artifactWarnings?: string[];
    stateBefore?: unknown;
    stateAfter?: unknown;
};

export function describeReplayComparison(expected: ComparableReplayResult, reproduced: ComparableReplayResult): ReplayComparisonView {
    if (expected.artifactWarnings && expected.artifactWarnings.length > 0) {
        const unavailableReason = `Replay succeeded, but the expected artifact is malformed, so deterministic comparison is unavailable: ${expected.artifactWarnings.join(" ")}`;
        return {status: "unavailable", unavailableReason, dimensions: unavailableDimensions(unavailableReason)};
    }
    if (expected.artifact === undefined || reproduced.artifact === undefined) {
        const unavailableReason = "No round artifact is available on one or both sides to compare.";
        return {status: "unavailable", unavailableReason, dimensions: unavailableDimensions(unavailableReason)};
    }

    const expectedArtifact = expected.artifact;
    const reproducedArtifact = reproduced.artifact;

    const dimensions: ReplayComparisonDimensions = {
        screen: compareDimension(expectedArtifact.screen, reproducedArtifact.screen, Array.isArray, (a, b) =>
            screensEqual(a, b) ? undefined : "Screen differs.",
        ),
        wins: compareDimension(expectedArtifact.wins, reproducedArtifact.wins, Array.isArray, (a, b) =>
            deepEqualJson(a, b) ? undefined : `Wins differ (expected ${a.length}, got ${b.length}).`,
        ),
        totalPayout: compareDimension(expectedArtifact.totalWin, reproducedArtifact.totalWin, isFiniteNumber, (a, b) =>
            a === b ? undefined : `Total payout differs (expected ${a}, got ${b}).`,
        ),
        steps: compareDimension(expectedArtifact.steps, reproducedArtifact.steps, Array.isArray, (a, b) =>
            deepEqualJson(a, b) ? undefined : "Round steps differ.",
        ),
        featureEvents: compareDimension(expectedArtifact.featureEvents ?? [], reproducedArtifact.featureEvents ?? [], Array.isArray, (a, b) =>
            deepEqualJson(a, b) ? undefined : "Feature events differ.",
        ),
        state: compareStatePair(expected.stateBefore, expected.stateAfter, reproduced.stateBefore, reproduced.stateAfter),
        rngReelStops: compareRngReelStopsDimension(expectedArtifact.debug, reproducedArtifact.debug),
    };

    const values = Object.values(dimensions);
    const hasMismatch = values.some((dimension) => dimension.status === "mismatch");
    const hasUnavailable = values.some((dimension) => dimension.status === "unavailable");
    let status: ReplayComparisonView["status"] = "match";
    if (hasMismatch) {
        status = "mismatch";
    } else if (hasUnavailable) {
        status = "partial";
    }
    return {status, dimensions};
}

function unavailableDimensions(reason: string): ReplayComparisonDimensions {
    const unavailable: ComparisonDimensionResult = {status: "unavailable", reason};
    return {
        screen: unavailable,
        wins: unavailable,
        totalPayout: unavailable,
        steps: unavailable,
        featureEvents: unavailable,
        state: unavailable,
        rngReelStops: unavailable,
    };
}

// Every dimension check goes through here so "unavailable" is always the outcome of an absent/wrong-
// shaped value, never a thrown exception — `isValid` is a real runtime guard (Array.isArray,
// isFiniteNumber, isDebugObject below), not just the compiler agreeing with an already-typed field, since
// the "expected" side in particular can originate from a pasted, hand-edited JSON blob.
function compareDimension<Value>(
    expectedValue: Value | undefined,
    reproducedValue: Value | undefined,
    isValid: (value: unknown) => value is Value,
    describeDifference: (expectedValue: Value, reproducedValue: Value) => string | undefined,
): ComparisonDimensionResult {
    if (!isValid(expectedValue) || !isValid(reproducedValue)) {
        return {status: "unavailable", reason: "Not present (or not in the expected shape) on one or both sides."};
    }
    const detail = describeDifference(expectedValue, reproducedValue);
    return detail === undefined ? {status: "match"} : {status: "mismatch", detail};
}

// "state transition" per requirement 4: only ever comparable when *both* the before and after snapshots
// are present on *both* sides — a partial pair (e.g. only "after" captured) is unavailable rather than
// compared against a mismatched pairing.
function compareStatePair(expectedBefore: unknown, expectedAfter: unknown, reproducedBefore: unknown, reproducedAfter: unknown): ComparisonDimensionResult {
    if (expectedBefore === undefined || expectedAfter === undefined || reproducedBefore === undefined || reproducedAfter === undefined) {
        return {status: "unavailable", reason: "A state snapshot is missing on one or both sides."};
    }
    const matches = deepEqualJson(expectedBefore, reproducedBefore) && deepEqualJson(expectedAfter, reproducedAfter);
    return matches ? {status: "match"} : {status: "mismatch", detail: "Session state before/after differs."};
}

// "RNG / reel stops" is deliberately narrower than the whole `debug` bag: that bag is free-form,
// per-game content (evaluator traces, RNG call counters, timestamps, ...) that can legitimately differ
// between two genuinely-matching runs without the game result itself being wrong — diffing all of it
// would produce false mismatches. Only an explicitly-named "reelStops" field within `debug` is treated
// as the deterministic subset worth comparing; `debug` as a whole is still shown in full under Advanced
// details for inspection regardless of what this dimension reports.
function compareRngReelStopsDimension(
    expectedDebug: Record<string, unknown> | undefined,
    reproducedDebug: Record<string, unknown> | undefined,
): ComparisonDimensionResult {
    const expectedReelStops = extractDeterministicReelStops(expectedDebug);
    const reproducedReelStops = extractDeterministicReelStops(reproducedDebug);
    if (expectedReelStops === undefined || reproducedReelStops === undefined) {
        return {
            status: "unavailable",
            reason: 'No explicit deterministic RNG/reel-stop data (a "reelStops" field) is present in the debug data on one or both sides.',
        };
    }
    return deepEqualJson(expectedReelStops, reproducedReelStops) ? {status: "match"} : {status: "mismatch", detail: "RNG/reel-stop data differs."};
}

function extractDeterministicReelStops(debug: Record<string, unknown> | undefined): unknown {
    if (debug === undefined || debug === null || typeof debug !== "object") {
        return undefined;
    }
    return debug.reelStops;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

// A defensive structural equality check over already-computed JSON-safe data (screen/wins/steps/
// feature-events/debug/state) — never a second game-calculation path, purely a presentation-layer diff
// of values the backend already produced. Mirrors RoundArtifactValidator's own private deepEqual (not
// exported from "pokie"), including the same depth cap standing in for cycle detection.
function deepEqualJson(a: unknown, b: unknown, depth = 0): boolean {
    if (depth > 100) {
        return false;
    }
    if (Object.is(a, b)) {
        return true;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => deepEqualJson(value, b[index], depth + 1));
    }
    if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
        const aKeys = Object.keys(a as Record<string, unknown>);
        const bKeys = Object.keys(b as Record<string, unknown>);
        return (
            aKeys.length === bKeys.length &&
            aKeys.every((key) => deepEqualJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], depth + 1))
        );
    }
    return false;
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
