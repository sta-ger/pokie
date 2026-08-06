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

export type WinningLineView = {
    lineId: string;
    definition: number[];
    pattern: number[];
    symbolsPositions: number[];
    winAmount: number;
};

export type WinHighlightKind = "line" | "scatter" | "cluster" | "value" | "way";

export type WinHighlight = {
    id: string;
    kind: WinHighlightKind;
    label: string;
    winAmount: number;
    // Cell coordinates as [reelIndex, rowIndex] pairs, already normalized to the same shape regardless
    // of which win kind produced them (a winning line's own `symbolsPositions` is reel indices only,
    // paired here with `definition[reelIndex]` for the row -- every other kind already carries
    // [reelIndex, rowIndex] pairs directly).
    positions: number[][];
    // Only present for kind "line" -- its hover behavior (highlight this line's own winning cells in
    // green, its other cells in grey) is intrinsically different from the "highlight every winning cell
    // the same color" behavior every other kind shares, so the renderer needs the raw line data back.
    line?: WinningLineView;
};

const HIGHLIGHT_PERSISTENT_COLOR: Record<WinHighlightKind, string> = {
    line: "#DDFFDD",
    scatter: "#ffda00",
    cluster: "#4dc9ff",
    value: "#ffb84d",
    way: "#c94dff",
};

// The color a hover-list button highlights its own win's cells in -- kept distinct from
// HIGHLIGHT_PERSISTENT_COLOR because pokie-examples' own source used a brighter, uniform "#00FF00" for
// every non-line hover button regardless of that win's persistent tint (scatter's own persistent tint
// is yellow, but its hover color is the same green every other kind uses). Preserved as-is: this
// extraction keeps examples-level behavior, not a redesign of it.
const HIGHLIGHT_HOVER_COLOR: Record<Exclude<WinHighlightKind, "line">, string> = {
    scatter: "#00FF00",
    cluster: "#4dc9ff",
    value: "#ffb84d",
    way: "#c94dff",
};

export function highlightPersistentColor(kind: WinHighlightKind): string {
    return HIGHLIGHT_PERSISTENT_COLOR[kind];
}

export function highlightHoverColor(kind: Exclude<WinHighlightKind, "line">): string {
    return HIGHLIGHT_HOVER_COLOR[kind];
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
    kind: Exclude<WinHighlightKind, "line">,
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
        const pattern = asNumberArray(win.pattern);
        const symbolsPositions = asNumberArray(win.symbolsPositions);
        const winAmount = typeof win.winAmount === "number" ? win.winAmount : 0;
        return {
            id: `line:${lineId}`,
            kind: "line",
            label: `Line: ${lineId}, win: ${winAmount}`,
            winAmount,
            positions: symbolsPositions.map((reelIndex) => [reelIndex, definition[reelIndex] ?? 0]),
            line: {lineId, definition, pattern, symbolsPositions, winAmount},
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
