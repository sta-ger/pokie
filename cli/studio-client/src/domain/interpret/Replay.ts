import type {
    ReplayDescriptor,
    RoundArtifactJson,
    StudioReplayJobView,
    StudioReplayListEntry,
    StudioReplayStatus,
    StudioRuntimeSessionView,
} from "../../api/types";

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
    // The replay job id (StudioReplayJobView.id) -- what onInspectStored/onCompareStored/
    // buildReplayDownloadUrl are all keyed by. Never the replay session's own identity -- see
    // `sessionId` below.
    id: string;
    // The actual newly-created game session's own identity (ReplayDescriptor.sessionId), minted fresh at
    // session-creation time inside StudioReplayExecutionService.run() -- distinct from `id` above, which
    // is the job/request tracking id minted before that session ever existed.
    sessionId: string;
    game: {id: string; name: string; version: string};
    round: number;
    seed: string | null;
    totalBet: number;
    totalWin: number;
    // Cell-level display strings, reel-major (screen[reelIndex][rowIndex], same orientation as
    // RoundArtifact.screen -- see ScreenTable's own doc comment), or undefined for a session without
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
        sessionId: descriptor.sessionId,
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

// Gates the Reproduce step for a "Replay Artifact" record (a pasted or previously-stored replay,
// as opposed to a fresh Recreate from seed/Recent Simulation attempt, which never claims to reproduce a
// *specific* prior result and so is never gated by this) — reproducing forward from round 1 is only
// ever a faithful, *verifiable* match of the original result when the seed and exact game build that
// produced it are known, AND — whenever the record carries a round artifact at all — its own game
// id/version provenance, state, and RNG trace are complete enough to actually verify a fresh
// reproduction against. A record that carries an artifact but not those (an "incomplete" record — e.g.
// an import that only kept the round-level result, or hand-trimmed the provenance block) is
// deliberately blocked here rather than left to silently produce a same-seed
// replay nobody can confirm is faithful: describeReplayComparison's own "unavailable" dimensions are
// for a *reproduced* side happening not to capture something despite a complete expected side, not for
// papering over an expected side that never had the data to check against in the first place. A record
// with no artifact at all (just a bare round/seed) has nothing to check state/RNG against, so it's
// exempt from this — same as the version check below.
//
// "bestEffort" is deliberately narrower than "blocked": it's only ever reported for the one condition
// where reproducing forward is still meaningful, just not *verifiable* -- a missing RNG/reel-stop trace
// (see the last check in describeReplayReproducibility below). Every other gap (no seed, wrong game
// build, no state to check the transition against) makes a fresh reproduction either impossible or
// actively misleading to attempt at all, so those stay hard "blocked". Inspecting the record itself is
// never gated by any of this -- it only ever governs whether Reproduce is offered, and if so, whether
// its result can be confirmed to match.
export type ReplayReproducibilityGate =
    | {status: "ready"}
    | {status: "bestEffort"; reason: string}
    | {status: "blocked"; reason: string; remediation: string};

export function describeReplayReproducibility(
    expected: {seed?: string; artifact?: RoundArtifactJson; stateBefore?: unknown; stateAfter?: unknown},
    currentGame: {id: string; version: string} | undefined,
): ReplayReproducibilityGate {
    if (expected.seed === undefined || expected.seed.trim().length === 0) {
        return {
            status: "blocked",
            reason:
                "This round has no recorded seed, so replaying it forward from round 1 can't deterministically reproduce the original result — likely an imported round that never carried a Pokie seed.",
            remediation:
                'Add a "seed" field with the original seed to the pasted artifact JSON before reproducing, or use it for inspection only (skip Reproduce and go straight to Inspect via Recent Replays).',
        };
    }

    const provenanceGame = expected.artifact?.provenance?.game;
    if (expected.artifact !== undefined && (!provenanceGame || !provenanceGame.id || !provenanceGame.version)) {
        return {
            status: "blocked",
            reason:
                'This round\'s artifact has no recorded game id/version provenance ("provenance.game"), so there is no way to confirm it was reproduced against the same game build that originally produced it — likely an incomplete or hand-trimmed record.',
            remediation:
                'Add a "provenance.game" object with the original "id" and "version" to the pasted artifact JSON before reproducing, or use it for inspection only (skip Reproduce and go straight to Inspect via Recent Replays).',
        };
    }

    if (currentGame && provenanceGame && (provenanceGame.id !== currentGame.id || provenanceGame.version !== currentGame.version)) {
        return {
            status: "blocked",
            reason: `This round was recorded against ${provenanceGame.id} v${provenanceGame.version}, but the project currently loaded is ${currentGame.id} v${currentGame.version} — reproducing it now would replay a different game build, not a faithful reproduction.`,
            remediation: `Open project "${provenanceGame.id}" at version ${provenanceGame.version} before reproducing this round, or use it for inspection only (skip Reproduce and go straight to Inspect).`,
        };
    }

    if (expected.artifact !== undefined) {
        if (expected.stateBefore === undefined || expected.stateAfter === undefined) {
            return {
                status: "blocked",
                reason:
                    'This round\'s artifact has no recorded session state ("stateBefore"/"stateAfter" immediately around the round), so a fresh reproduction\'s own state transition can\'t be verified against it — likely an incomplete or hand-trimmed record.',
                remediation:
                    'Add "stateBefore" and "stateAfter" fields (captured alongside the original round) to the pasted artifact JSON before reproducing, or use it for inspection only (skip Reproduce and go straight to Inspect).',
            };
        }

        if (extractDeterministicReelStops(expected.artifact.debug) === undefined) {
            return {
                status: "bestEffort",
                reason:
                    'This round\'s artifact has no recorded RNG/reel-stop trace (a "reelStops" field under "debug"), so a fresh reproduction\'s own RNG data can\'t be verified against it. Inspection of the recorded round is unaffected -- Reproduce is still offered, but only as a best-effort forward replay: it is explicitly non-verifiable, never presented as an exact match.',
            };
        }
    }

    return {status: "ready"};
}

// Same role as interpretReports.ts's ReportListView — distinguishes "no replays run yet" from "here's
// the list"; "loading"/"error" are constructed directly by main.ts around the fetch call itself, same
// convention as every other list in this app.
export type ReplayListView = {status: "empty"} | {status: "loaded"; entries: StudioReplayListEntry[]};

export function describeReplayList(entries: StudioReplayListEntry[]): ReplayListView {
    const deduped = dedupeReplayListEntries(entries);
    return deduped.length === 0 ? {status: "empty"} : {status: "loaded", entries: deduped};
}

// The canonical identity two "Recent replays" entries are the same reproduction attempt for: the same
// game build, round, and seed. Undefined for an entry with no game (a job that hasn't loaded far enough
// to know its game yet) or no seed (the request never named one, so the game generated its own —
// there's no stable input two such entries could ever be said to share, unlike a genuine retry of the
// exact same named seed). Mirrors StudioRuntimeManager.recordRecentSpin()'s own canonical
// (sessionId, studioRequestId) identity for the Session Spin list, applied here to the one identity
// that actually makes two *replay* entries the same target: reproducing plays a brand-new session
// forward from round 1 (see StudioReplayExecutionService.run()), so there is no per-round request id to
// key on the way a live spin has -- (game, round, seed) is the closest thing this list has to one.
function replayListEntryIdentityKey(entry: StudioReplayListEntry): string | undefined {
    if (!entry.game || entry.seed === undefined || entry.seed.trim().length === 0) {
        return undefined;
    }
    return `${entry.game.id}@${entry.game.version}::${entry.round}::${entry.seed}`;
}

// Entries arrive most-recently-started first (see StudioReplayListEntry's own doc comment) -- keeping
// only the first occurrence of each identity is therefore keeping the most recent attempt at that exact
// target and dropping older, superseded attempts (e.g. every "Run again with the same parameters"
// click), never the reverse.
function dedupeReplayListEntries(entries: StudioReplayListEntry[]): StudioReplayListEntry[] {
    const seen = new Set<string>();
    const deduped: StudioReplayListEntry[] = [];
    for (const entry of entries) {
        const key = replayListEntryIdentityKey(entry);
        if (key !== undefined) {
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
        }
        deduped.push(entry);
    }
    return deduped;
}

// Plain, human-readable status for a "Recent replays" entry -- the raw StudioReplayStatus enum
// ("completed", "cancelled", ...) is job-execution vocabulary, not honest about what this list actually
// is: every entry here is a *recreated* replay session, never a genuinely recorded one (see
// describeLoadedReplay's own "Recorded" vs "Recreated" distinction below) -- "Reproduced"/"Reproduction
// failed" say so plainly instead of implying a generic background job.
const REPLAY_ENTRY_STATUS_LABEL: Record<StudioReplayStatus, string> = {
    queued: "Queued to reproduce",
    running: "Reproducing…",
    completed: "Reproduced",
    failed: "Reproduction failed",
    cancelled: "Reproduction cancelled",
};

export function describeReplayEntryStatus(status: StudioReplayStatus): string {
    return REPLAY_ENTRY_STATUS_LABEL[status];
}

// Whether "Reproduce & compare" from this exact "Recent replays" entry can ever produce anything
// meaningful -- the same foundational check describeReplayReproducibility applies first, before any
// artifact/provenance/state completeness check: no recorded seed means a fresh reproduction would
// create a new, differently-seeded session, not recreate this round at all. The list summary never
// carries enough (no artifact, no state snapshots) to evaluate the rest of that gate client-side, so
// this is deliberately only the one check the list itself can answer -- the full gate still applies
// once a record is actually loaded (see the "artifact" source's own reproducibility check).
export function isReplayListEntryReproducible(entry: StudioReplayListEntry): boolean {
    return entry.seed !== undefined && entry.seed.trim().length > 0;
}

// Requirement (Replay capabilities/degraded mode): every loaded replay, regardless of source, is judged
// against the same four questions -- can it be inspected, reproduced, compared against a known-good
// result, and exported -- each with its own honest availability and reason, rather than one page
// silently omitting an action another page would offer for the same kind of round. "bestEffort" sits
// between "available" and "unavailable": the capability is offered, but its result is explicitly not
// verifiable (currently only ever Reproducible, when an artifact is missing its RNG/reel-stop trace —
// see describeReplayReproducibility's own "bestEffort" status).
export type ReplayCapabilityStatus = "available" | "bestEffort" | "unavailable";

export type ReplayCapability = {status: ReplayCapabilityStatus; reason: string};

export type ReplayCapabilitiesView = {
    inspectable: ReplayCapability;
    reproducible: ReplayCapability;
    comparable: ReplayCapability;
    exportable: ReplayCapability;
};

export function describeReplayCapabilities(input: {
    source: "seedRound" | "artifact" | "spin" | "simulation";
    // Something concrete is actually loaded to look at -- for "spin"/"artifact" this is true as soon as
    // a spin is selected / an artifact is validated (there's already a recorded round or a validated
    // record to inspect); for "seedRound"/"simulation" (a fresh forward replay with nothing recorded
    // yet) this only becomes true once Reproduce has actually produced a result.
    hasResult: boolean;
    // Only ever meaningful for "artifact" -- the other three sources have no prior-recorded-artifact
    // gate to check (see describeReplayReproducibility's own doc comment).
    reproducibility?: ReplayReproducibilityGate;
    hasComparisonTarget: boolean;
    comparison?: ReplayComparisonView;
    canExport: boolean;
}): ReplayCapabilitiesView {
    return {
        inspectable: describeInspectableCapability(input.hasResult),
        reproducible: describeReproducibleCapability(input.source, input.reproducibility),
        comparable: describeComparableCapability(input.source, input.hasComparisonTarget, input.comparison),
        exportable: describeExportableCapability(input.canExport),
    };
}

function describeInspectableCapability(hasResult: boolean): ReplayCapability {
    return hasResult
        ? {status: "available", reason: "This round's data is loaded and ready to inspect."}
        : {status: "unavailable", reason: "Nothing loaded yet -- reproduce this round first to inspect its result."};
}

function describeReproducibleCapability(
    source: "seedRound" | "artifact" | "spin" | "simulation",
    reproducibility: ReplayReproducibilityGate | undefined,
): ReplayCapability {
    if (source === "spin") {
        return {status: "unavailable", reason: "This is a live spin's actual recorded result -- there's nothing to reproduce it against."};
    }
    if (source !== "artifact") {
        return {status: "available", reason: "Ready -- plays a fresh session forward from round 1 using the configured seed."};
    }
    if (reproducibility === undefined || reproducibility.status === "ready") {
        return {status: "available", reason: "Ready -- plays a fresh session forward from round 1 using the recorded seed."};
    }
    if (reproducibility.status === "bestEffort") {
        return {status: "bestEffort", reason: reproducibility.reason};
    }
    return {status: "unavailable", reason: reproducibility.reason};
}

function describeComparableCapability(
    source: "seedRound" | "artifact" | "spin" | "simulation",
    hasComparisonTarget: boolean,
    comparison: ReplayComparisonView | undefined,
): ReplayCapability {
    if (source !== "artifact") {
        return {status: "unavailable", reason: "A fresh forward replay with no prior recorded result to compare against."};
    }
    if (!hasComparisonTarget) {
        return {status: "unavailable", reason: "No round artifact recorded on this entry to compare against."};
    }
    if (comparison === undefined) {
        return {status: "available", reason: "Will be verified against the loaded artifact once reproduced."};
    }
    if (comparison.status === "unavailable") {
        return {status: "unavailable", reason: comparison.unavailableReason ?? "Verification unavailable."};
    }
    if (comparison.status === "partial") {
        return {status: "bestEffort", reason: "Partially verified -- at least one dimension was unavailable to compare."};
    }
    return {
        status: "available",
        reason: comparison.status === "match" ? "Verified -- matches the expected result." : "Verified -- differs from the expected result.",
    };
}

function describeExportableCapability(canExport: boolean): ReplayCapability {
    return canExport
        ? {status: "available", reason: "Ready to download as JSON."}
        : {status: "unavailable", reason: "Reproduce this round (or select a spin) to get an exportable result."};
}

// The Loaded replay card's own view model: every source (Recreate from seed / Replay Artifact / Session
// Spin / Recent Simulation) renders the exact same six-field summary plus the four capabilities above,
// rather than each inventing its own ad hoc subset -- what differs between sources is only how each
// field is derived, which is what the source-specific `describeLoaded*` functions below compute.
export type LoadedReplayCardView = {
    // Plainly states whether what's loaded is a genuinely recorded round (Session Spin: an actual past
    // spin, looked up, never recreated) or a recreated one (every other source: a brand-new session
    // played forward from round 1 -- see StudioReplayExecutionService.run()) -- the two are never
    // conflated as if a recreation were the same thing as the original recorded round.
    source: string;
    identities: string;
    seed: string;
    versionHash: string;
    timestamp: string;
    completeness: string;
    capabilities: ReplayCapabilitiesView;
};

export type LoadedReplayInput =
    | {source: "spin"; spin: StudioRuntimeSessionView; canExport: boolean}
    | {
          source: "artifact";
          expected: {seed?: string; artifact?: RoundArtifactJson};
          reproducibility?: ReplayReproducibilityGate;
          result?: ReplayResultView;
          comparison?: ReplayComparisonView;
          canExport: boolean;
      }
    | {
          source: "seedRound" | "simulation";
          target: {round: number; seed?: string};
          currentGame?: {id: string; version: string};
          result?: ReplayResultView;
          canExport: boolean;
      };

export function describeLoadedReplay(input: LoadedReplayInput): LoadedReplayCardView {
    if (input.source === "spin") {
        return describeLoadedSpin(input.spin, input.canExport);
    }
    if (input.source === "artifact") {
        return describeLoadedArtifact(input.expected, input.reproducibility, input.result, input.comparison, input.canExport);
    }
    return describeLoadedFreshReplay(input.source, input.target, input.currentGame, input.result, input.canExport);
}

function describeLoadedSpin(spin: StudioRuntimeSessionView, canExport: boolean): LoadedReplayCardView {
    const identityParts = [`session ${spin.sessionId}`];
    if (spin.studioRound !== undefined) {
        identityParts.push(`round ${spin.studioRound}`);
    }
    if (spin.studioRequestId) {
        identityParts.push(`request ${spin.studioRequestId}`);
    }
    const hasDebugBundle = spin.debug?.debugData !== undefined || spin.debug?.stateBefore !== undefined || spin.debug?.stateAfter !== undefined;
    let completeness: string;
    if (hasDebugBundle) {
        completeness = "Full -- recorded with its debug bundle (state and RNG/debug data).";
    } else if (spin.screen) {
        completeness = "Partial -- screen recorded, no debug data (debug mode was off when this spin was made).";
    } else {
        completeness = "Minimal -- no screen or debug data was captured for this spin.";
    }
    return {
        source: spin.studioSource === "pre-generated" ? "Recorded -- pre-generated spin" : "Recorded -- live spin",
        identities: identityParts.join(", "),
        seed: "(not tracked per spin -- see the runtime session's own seed)",
        versionHash: `${spin.game.id} v${spin.game.version}`,
        timestamp: spin.studioRecordedAt ? new Date(spin.studioRecordedAt).toLocaleString() : "(unknown)",
        completeness,
        capabilities: describeReplayCapabilities({source: "spin", hasResult: true, hasComparisonTarget: false, canExport}),
    };
}

function describeLoadedArtifact(
    expected: {seed?: string; artifact?: RoundArtifactJson},
    reproducibility: ReplayReproducibilityGate | undefined,
    result: ReplayResultView | undefined,
    comparison: ReplayComparisonView | undefined,
    canExport: boolean,
): LoadedReplayCardView {
    const provenanceGame = expected.artifact?.provenance?.game;
    const versionHashParts: string[] = [];
    if (provenanceGame?.id && provenanceGame.version) {
        versionHashParts.push(`${provenanceGame.id} v${provenanceGame.version}`);
    }
    if (expected.artifact?.hash) {
        versionHashParts.push(`hash ${expected.artifact.hash}`);
    }
    let completeness: string;
    if (reproducibility === undefined) {
        completeness = "(not yet validated)";
    } else if (reproducibility.status === "ready") {
        completeness = "Full -- seed, provenance, state, and RNG trace all recorded.";
    } else if (reproducibility.status === "bestEffort") {
        completeness = "Partial -- seed, provenance, and state recorded, but no RNG/reel-stop trace (best-effort reproduction only).";
    } else {
        completeness = "Incomplete -- missing data required to verify a reproduction (see below).";
    }
    return {
        source: "Recreated -- replay artifact",
        identities: result ? `replay session ${result.sessionId}, replay job ${result.id}` : "(assigned once reproduced)",
        seed: expected.seed ?? "(none)",
        versionHash: versionHashParts.length > 0 ? versionHashParts.join(", ") : "(not recorded)",
        timestamp: result ? new Date(result.timestamp).toLocaleString() : "(not yet reproduced)",
        completeness,
        capabilities: describeReplayCapabilities({
            source: "artifact",
            hasResult: true,
            reproducibility,
            hasComparisonTarget: expected.artifact !== undefined,
            comparison,
            canExport,
        }),
    };
}

function describeLoadedFreshReplay(
    source: "seedRound" | "simulation",
    target: {round: number; seed?: string},
    currentGame: {id: string; version: string} | undefined,
    result: ReplayResultView | undefined,
    canExport: boolean,
): LoadedReplayCardView {
    const versionHashParts: string[] = [];
    if (result) {
        versionHashParts.push(`${result.game.id} v${result.game.version}`);
        if (result.artifact?.hash) {
            versionHashParts.push(`hash ${result.artifact.hash}`);
        }
    } else if (currentGame) {
        versionHashParts.push(`${currentGame.id} v${currentGame.version}`);
    }
    let completeness: string;
    if (!result) {
        completeness = "Not yet run -- reproduce this round to generate a result.";
    } else if (result.artifact) {
        completeness = "Full -- round artifact captured (screen, wins, steps, debug).";
    } else {
        completeness = "Partial -- round-level result only, no per-step artifact for this game.";
    }
    return {
        source: source === "seedRound" ? "Recreated -- recreate from seed" : "Recreated -- recent simulation",
        identities: result ? `replay session ${result.sessionId}, replay job ${result.id}` : "(assigned once reproduced)",
        seed: (result ? result.seed : target.seed) ?? "(freshly generated)",
        versionHash: versionHashParts.length > 0 ? versionHashParts.join(", ") : "(unknown)",
        timestamp: result ? new Date(result.timestamp).toLocaleString() : "(not yet reproduced)",
        completeness,
        capabilities: describeReplayCapabilities({source, hasResult: result !== undefined, hasComparisonTarget: false, canExport}),
    };
}
