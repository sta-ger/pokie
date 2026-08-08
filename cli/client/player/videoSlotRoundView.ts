// Structural view of a VideoSlot(WithFreeGames) round/initial network-data response -- the public DTO
// shape pokie's own net/videoslot serializers produce (see src/net/videoslot/VideoSlotNetworkData.ts
// and VideoSlotWithFreeGamesNetworkData.ts), re-declared here rather than imported from the "pokie"
// package so this browser client stays a standalone static asset with no runtime dependency on it --
// the same convention cli/client/types.ts (SessionResponse) already follows.
//
// Every function below only reshapes fields the response already carries -- it never recomputes a win,
// line, cluster, or feature outcome. The actual win/line/cluster/feature calculation happened
// server-side (or, for pokie-examples, in the local session play() call this client's own equivalent
// never runs); this module's whole job is turning that already-computed payload into a display-ready
// shape the renderer can iterate without knowing the field names of any one win kind.
export type VideoSlotRoundResponse = {
    reelsSymbols?: unknown;
    totalWin?: unknown;
    winningLines?: unknown;
    winningScatters?: unknown;
    winningClusters?: unknown;
    winningValues?: unknown;
    winningWays?: unknown;
    paytable?: unknown;
    linesDefinitions?: unknown;
    availableBets?: unknown;
    bet?: unknown;
    availableBetModeIds?: unknown;
    betModeId?: unknown;
    freeGamesNum?: unknown;
    freeGamesSum?: unknown;
    freeGamesBank?: unknown;
} & Record<string, unknown>;

// The one structural check this client makes before treating a response as a video-slot round: a
// `reelsSymbols` grid. Every other field below is optional -- a game with no wins this round, no free
// games feature, or no paytable/lines data at all is still a valid video-slot response, just one whose
// derive* functions below return empty results for that part of the view.
export function isVideoSlotRoundResponse(response: Record<string, unknown>): response is VideoSlotRoundResponse & {reelsSymbols: string[][]} {
    return Array.isArray(response.reelsSymbols) && response.reelsSymbols.every((reel) => Array.isArray(reel));
}

// A win "kind" is any game's own win-evaluation type string (see "pokie"'s own WinComponent.getType() /
// RoundArtifactWin.type) -- never a closed enum, since a RoundArtifact is explicitly game-generic and a
// future game is free to introduce a win type this module has no prior knowledge of (see
// highlightPersistentColor/highlightHoverColor's own fallback below for exactly that case). VideoSlot's
// own response-level kinds ("line"/"scatter"/"cluster"/"value"/"way") are simply the kind strings its own
// deriveWinHighlights below happens to use.
export type WinHighlightKind = string;

export type WinHighlight = {
    id: string;
    kind: WinHighlightKind;
    label: string;
    winAmount: number;
    // Cell coordinates as [reelIndex, rowIndex] pairs, already normalized to the same shape regardless
    // of which win kind produced them (a winning line's own `symbolsPositions` is reel indices only,
    // paired here with `definition[reelIndex]` for the row -- every other kind already carries
    // [reelIndex, rowIndex] pairs directly). Always the cells that actually won -- never this win's full
    // configured path (see `paylinePositions` below for that).
    positions: number[][];
    // Only ever present for a "line" win whose full configured payline path is actually known (VideoSlot's
    // own `linesDefinitions[lineId]`, or a RoundArtifact line win's own `metadata.definition` -- see
    // deriveWinHighlightsFromRoundArtifactWins below) -- every reel's own row on that path, not just the
    // (possibly narrower) subset that actually won. Lets a renderer trace the whole line on hover, distinct
    // from the winning subset `positions` already covers -- see renderWinHighlightsList's own "line" branch.
    paylinePositions?: number[][];
};

const HIGHLIGHT_PERSISTENT_COLOR: Record<string, string> = {
    line: "#DDFFDD",
    scatter: "#ffda00",
    cluster: "#4dc9ff",
    value: "#ffb84d",
    way: "#c94dff",
    ways: "#c94dff",
};

// A win kind this module has no curated color for (any RoundArtifact win type outside VideoSlot's own
// five above -- e.g. "jackpot"/"legacy", or a future game's own type) still gets a real, visible
// highlight, just not a specially-chosen one.
const DEFAULT_PERSISTENT_COLOR = "#cccccc";

// The color a hover-list button highlights its own win's cells in -- kept distinct from
// HIGHLIGHT_PERSISTENT_COLOR because pokie-examples' own source used a brighter, uniform "#00FF00" for
// every non-line hover button regardless of that win's persistent tint (scatter's own persistent tint
// is yellow, but its hover color is the same green every other kind uses). Preserved as-is: this
// extraction keeps examples-level behavior, not a redesign of it.
const HIGHLIGHT_HOVER_COLOR: Record<string, string> = {
    scatter: "#00FF00",
    cluster: "#4dc9ff",
    value: "#ffb84d",
    way: "#c94dff",
    ways: "#c94dff",
};

export function highlightPersistentColor(kind: WinHighlightKind): string {
    return HIGHLIGHT_PERSISTENT_COLOR[kind] ?? DEFAULT_PERSISTENT_COLOR;
}

// "line" itself has no entry here -- renderWinHighlightsList never looks a "line" highlight's hover color
// up this way, it traces `paylinePositions` instead (see WinHighlight's own doc comment) -- but any other
// kind with no curated hover color of its own (same "unknown win type" case as
// DEFAULT_PERSISTENT_COLOR) falls back to its own persistent tint, a reasonable hover color absent a more
// specific one.
export function highlightHoverColor(kind: WinHighlightKind): string {
    return HIGHLIGHT_HOVER_COLOR[kind] ?? highlightPersistentColor(kind);
}

function asRecord(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asNumberArray(value: unknown): number[] {
    return Array.isArray(value) ? (value.filter((entry) => typeof entry === "number") as number[]) : [];
}

function asPositions(value: unknown): number[][] {
    return Array.isArray(value) ? (value as number[][]) : [];
}

function derivePositionalHighlights(
    kind: string,
    record: unknown,
    describe: (symbolId: string, winAmount: number, positions: number[][]) => string,
): WinHighlight[] {
    return Object.entries(asRecord(record)).map(([symbolId, raw]) => {
        const win = asRecord(raw);
        const winAmount = typeof win.winAmount === "number" ? win.winAmount : 0;
        const positions = asPositions(win.symbolsPositions);
        return {
            id: `${kind}:${symbolId}`,
            kind,
            label: describe(symbolId, winAmount, positions),
            winAmount,
            positions,
        };
    });
}

// One combined, render-ready list -- lines first, then scatters/clusters/values/ways, the same order
// pokie-examples' own drawWinningLinesList rendered them in.
export function deriveWinHighlights(response: VideoSlotRoundResponse): WinHighlight[] {
    const lineHighlights: WinHighlight[] = Object.entries(asRecord(response.winningLines)).map(([lineId, raw]) => {
        const win = asRecord(raw);
        const definition = asNumberArray(win.definition);
        const symbolsPositions = asNumberArray(win.symbolsPositions);
        const winAmount = typeof win.winAmount === "number" ? win.winAmount : 0;
        return {
            id: `line:${lineId}`,
            kind: "line",
            label: `Line: ${lineId}, win: ${winAmount}`,
            winAmount,
            positions: symbolsPositions.map((reelIndex) => [reelIndex, definition[reelIndex] ?? 0]),
            paylinePositions: definition.map((row, reelIndex) => [reelIndex, row]),
        };
    });

    return [
        ...lineHighlights,
        ...derivePositionalHighlights("scatter", response.winningScatters, (id, win) => `Scatter: ${id}, win: ${win}`),
        ...derivePositionalHighlights(
            "cluster",
            response.winningClusters,
            (id, win, positions) => `Cluster: ${id} x${positions.length}, win: ${win}`,
        ),
        ...derivePositionalHighlights("value", response.winningValues, (id, win) => `Value: ${id}, win: ${win}`),
        ...derivePositionalHighlights("way", response.winningWays, (id, win) => `Way: ${id}, win: ${win}`),
    ];
}

export function deriveTotalWin(response: VideoSlotRoundResponse): number | undefined {
    return typeof response.totalWin === "number" ? response.totalWin : undefined;
}

// The one other shape this module's own WinHighlight contract is adapted from -- an arbitrary game's own
// RoundArtifact win (see "pokie"'s src/artifact/RoundArtifactWin.ts, mirrored client-side by Studio's own
// RoundArtifactWin in cli/studio-client/src/api/types.ts), structurally rather than by importing that
// type directly (this module stays a standalone static asset with no runtime dependency on either "pokie"
// or Studio -- same convention VideoSlotRoundResponse's own doc comment already follows). Every field read
// below is already computed by the game's own win evaluation pipeline; this adapter only ever reshapes it.
export type GenericRoundArtifactWin = {
    type: string;
    id: string;
    symbolId: string | number;
    winAmount: number;
    winningPositions: readonly (readonly number[])[];
    metadata?: Record<string, unknown>;
};

// RoundArtifactWin.metadata carries no discriminated type client-side, so this only ever trusts a
// "definition" that's actually shaped like one: an array with exactly one row index per reel on this
// screen. Anything else -- absent (every win type that never carries a full configured payline: ways,
// cluster, scatter, value, jackpot, legacy, a Stake Engine import's synthetic aggregate), malformed, or
// sized for a different reel count -- falls back to "no path for this win", never a fabricated line. Mirrors
// Studio's own former PaylineOverlay.resolveLineDefinition, now unified into this one shared adapter.
function resolveRoundArtifactLineDefinition(win: GenericRoundArtifactWin, reelCount: number): number[] | undefined {
    const raw = win.metadata?.["definition"];
    if (!Array.isArray(raw) || raw.length !== reelCount || !raw.every((row) => typeof row === "number")) {
        return undefined;
    }
    return raw as number[];
}

// The single game-generic counterpart to deriveWinHighlights above -- both produce the exact same
// WinHighlight contract renderPlayer.ts's own applyPersistentHighlights/renderWinHighlightsList already
// render, so a game-specific VideoSlot(WithFreeGames) response and an arbitrary game's own RoundArtifact
// converge on one shared presentation rather than each having its own renderer. This is what
// cli/studio-client/src/components/common/CanonicalPlayerView.tsx (Studio's own single canonical "screen,
// with wins" entrypoint, mounted via GameScreenView -- Play, Replay, sampled rounds, and Outcome Library
// inspection all render through it) calls to resolve a step's own highlighted/payline positions, before
// mounting renderPlayer.ts's own DOM functions directly against the result -- see CanonicalPlayerView's
// own doc comment.
export function deriveWinHighlightsFromRoundArtifactWins(wins: readonly GenericRoundArtifactWin[], reelCount: number): WinHighlight[] {
    return wins.map((win) => {
        const definition = resolveRoundArtifactLineDefinition(win, reelCount);
        return {
            id: `${win.type}:${win.id}`,
            kind: win.type,
            label: `${win.type}: ${String(win.symbolId)}, win: ${win.winAmount}`,
            winAmount: win.winAmount,
            positions: win.winningPositions.map((position) => [...position]),
            ...(definition ? {paylinePositions: definition.map((row, reelIndex) => [reelIndex, row])} : {}),
        };
    });
}

export type FeatureCounter = {label: string; value: number};

// Free games is the one feature pokie-examples' own shared UI (data.ts/utils.ts's setCountersValues)
// rendered generically across every game that has it -- carried through as-is rather than generalized
// further, since no other feature counter convention exists yet to generalize from.
export function deriveFeatureCounters(response: VideoSlotRoundResponse): FeatureCounter[] {
    const counters: FeatureCounter[] = [];
    if (typeof response.freeGamesNum === "number") {
        counters.push({label: "FG num", value: response.freeGamesNum});
    }
    if (typeof response.freeGamesSum === "number") {
        counters.push({label: "FG sum", value: response.freeGamesSum});
    }
    if (typeof response.freeGamesBank === "number") {
        counters.push({label: "FG bank", value: response.freeGamesBank});
    }
    return counters;
}

export type PaytableView = {
    multipliers: number[];
    rows: {symbolId: string; amounts: (number | undefined)[]}[];
};

// `paytable` is bet-keyed (`Record<betAmount, Record<symbolId, Record<multiplier, amount>>>`) --
// this reads the first available bet's table, the same entry pokie-examples' own ui.ts built its
// paytable display from (`Object.values(initialData.paytable)[0]`).
export function derivePaytableView(paytable: unknown): PaytableView | undefined {
    const betEntries = Object.values(asRecord(paytable));
    const bySymbol = betEntries[0];
    if (bySymbol === null || typeof bySymbol !== "object") {
        return undefined;
    }

    const symbolPays = bySymbol as Record<string, unknown>;
    const multiplierSet = new Set<number>();
    Object.values(symbolPays).forEach((pays) => {
        Object.keys(asRecord(pays)).forEach((multiplier) => multiplierSet.add(Number(multiplier)));
    });
    const multipliers = Array.from(multiplierSet).sort((a, b) => a - b);

    const rows = Object.entries(symbolPays).map(([symbolId, pays]) => {
        const record = asRecord(pays);
        return {
            symbolId,
            amounts: multipliers.map((multiplier) => (typeof record[multiplier] === "number" ? (record[multiplier] as number) : undefined)),
        };
    });

    return {multipliers, rows};
}

export type LineDefinitionView = {lineId: string; definition: number[]};

export function deriveLineDefinitions(linesDefinitions: unknown): LineDefinitionView[] {
    return Object.entries(asRecord(linesDefinitions)).map(([lineId, definition]) => ({
        lineId,
        definition: asNumberArray(definition),
    }));
}

export function deriveAvailableBets(availableBets: unknown): number[] {
    return asNumberArray(availableBets);
}

// Only present at all when the session's own runtime opted into bet-mode selection (see
// VideoSlotWithBetModesSession/supportsBetModeSelecting server-side) -- absent on a response from a
// session that never configured more than the single default mode, same as availableBets never
// invents choices a session doesn't actually support.
export function deriveAvailableBetModeIds(availableBetModeIds: unknown): string[] {
    return Array.isArray(availableBetModeIds) ? availableBetModeIds.filter((entry) => typeof entry === "string") : [];
}

export function deriveBetModeId(betModeId: unknown): string | undefined {
    return typeof betModeId === "string" ? betModeId : undefined;
}
