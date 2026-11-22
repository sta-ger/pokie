import type {RoundRecordWin} from "../roundrecord/RoundRecordWin.js";
import type {WeightedOutcomeLibrary} from "./WeightedOutcomeLibrary.js";

// One exact contribution row, computed from a retained outcome library's own RoundRecords. "rtpContribution"
// is the win amount attributable to this line/symbol divided by the round's stake and weighted across the
// whole library; "hitFrequency" is the probability that a random round contains at least one such win.
// Contributions can overlap (a line win also appears in the symbol table, and a round can pay several
// lines), so neither table is an additive decomposition of RTP when summed on its own.
export type WeightedOutcomeWinContribution = {
    readonly kind: "line" | "symbol";
    readonly key: string;
    readonly label: string;
    readonly symbolId?: string;
    readonly rtpContribution: number;
    readonly hitFrequency: number;
    readonly outcomeCount: number;
};

export type WeightedOutcomeWinContributionTable = {
    readonly entries: readonly WeightedOutcomeWinContribution[];
    readonly truncated: boolean;
};

// A distinct win event and the exact probability that one round contains it. This is the event-level
// answer a slot mathematician needs ("P(A × 5)", "P(3 scatters)"), not a total-payout bucket: a round can
// contain several events, so the rows overlap and their probabilities do not sum to 1.
export type WeightedOutcomeWinEvent = {
    readonly kind: "line" | "scatter" | "other";
    readonly key: string;
    readonly label: string;
    readonly winType: string;
    readonly winId: string;
    readonly symbolId?: string;
    readonly matchCount?: number;
    readonly probability: number;
    readonly rtpContribution: number;
    readonly outcomeCount: number;
};

export type WeightedOutcomeWinEventTable = {
    readonly entries: readonly WeightedOutcomeWinEvent[];
    readonly truncated: boolean;
};

export type WeightedOutcomeWinAnalysis = {
    readonly line: WeightedOutcomeWinContributionTable;
    readonly symbol: WeightedOutcomeWinContributionTable;
    readonly events: WeightedOutcomeWinEventTable;
    /** True when any table was limited to its own largest rows. The library itself remains complete. */
    readonly truncated: boolean;
};

export const DEFAULT_MAX_WIN_CONTRIBUTION_ROWS = 40;
export const DEFAULT_MAX_WIN_EVENT_ROWS = 80;

type ContributionTally = {
    symbolId?: string;
    rtpContribution: number;
    hitWeight: number;
    outcomeCount: number;
};

type EventTally = {
    kind: WeightedOutcomeWinEvent["kind"];
    label: string;
    winType: string;
    winId: string;
    symbolId?: string;
    matchCount?: number;
    rtpContribution: number;
    hitWeight: number;
    outcomeCount: number;
};

/**
 * Computes the exact line/symbol contribution tables and the distinct win-event probability table in one
 * pass over a library's retained outcomes. The caller owns the size policy (Studio skips this scan for a
 * very large library; see StudioExactMathService); this function itself has no outcome-count limit, only
 * row limits so one huge table cannot dominate a response.
 */
export function analyzeWeightedOutcomeWins(
    library: WeightedOutcomeLibrary<string>,
    options: {readonly maxContributionRows?: number; readonly maxEventRows?: number} = {},
): WeightedOutcomeWinAnalysis {
    const maxContributionRows = options.maxContributionRows ?? DEFAULT_MAX_WIN_CONTRIBUTION_ROWS;
    const maxEventRows = options.maxEventRows ?? DEFAULT_MAX_WIN_EVENT_ROWS;
    const totalWeight = library.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0);
    const lineTallies = new Map<string, ContributionTally>();
    const symbolTallies = new Map<string, ContributionTally>();
    const eventTallies = new Map<string, EventTally>();

    for (const outcome of library.outcomes) {
        const share = outcome.weight / totalWeight;
        const stake = outcome.record.stake;
        const seenLines = new Set<string>();
        const seenSymbols = new Set<string>();
        const seenEvents = new Set<string>();
        for (const step of outcome.record.steps) {
            for (const win of step.wins) {
                const symbolId = win.symbolId === null || win.symbolId === undefined ? undefined : String(win.symbolId);
                const rtp = stake > 0 ? (share * win.winAmount) / stake : 0;

                if (win.type === "line") {
                    const key = `line:${win.id}:${symbolId ?? ""}`;
                    const tally = lineTallies.get(key) ?? {symbolId, rtpContribution: 0, hitWeight: 0, outcomeCount: 0};
                    tally.rtpContribution += rtp;
                    if (!seenLines.has(key)) {
                        tally.hitWeight += share;
                        tally.outcomeCount++;
                        seenLines.add(key);
                    }
                    lineTallies.set(key, tally);
                }

                let symbolKey: string | undefined;
                if (symbolId !== undefined) {
                    symbolKey = `symbol:${symbolId}`;
                } else if (win.type !== "line") {
                    symbolKey = `symbol:${win.type}:${win.id}`;
                }
                if (symbolKey !== undefined) {
                    const tally = symbolTallies.get(symbolKey) ?? {symbolId, rtpContribution: 0, hitWeight: 0, outcomeCount: 0};
                    tally.rtpContribution += rtp;
                    if (!seenSymbols.has(symbolKey)) {
                        tally.hitWeight += share;
                        tally.outcomeCount++;
                        seenSymbols.add(symbolKey);
                    }
                    symbolTallies.set(symbolKey, tally);
                }

                const event = describeWinEvent(win, symbolId);
                const eventTally = eventTallies.get(event.key) ?? {
                    kind: event.kind,
                    label: event.label,
                    winType: win.type,
                    winId: win.id,
                    ...(symbolId === undefined ? {} : {symbolId}),
                    ...(event.matchCount === undefined ? {} : {matchCount: event.matchCount}),
                    rtpContribution: 0,
                    hitWeight: 0,
                    outcomeCount: 0,
                };
                eventTally.rtpContribution += rtp;
                if (!seenEvents.has(event.key)) {
                    eventTally.hitWeight += share;
                    eventTally.outcomeCount++;
                    seenEvents.add(event.key);
                }
                eventTallies.set(event.key, eventTally);
            }
        }
    }

    const line = toContributionTable(lineTallies, "line", maxContributionRows);
    const symbol = toContributionTable(symbolTallies, "symbol", maxContributionRows);
    const events = toEventTable(eventTallies, maxEventRows);
    return {line, symbol, events, truncated: line.truncated || symbol.truncated || events.truncated};
}

function describeWinEvent(win: RoundRecordWin<string>, symbolId: string | undefined): {key: string; label: string; kind: WeightedOutcomeWinEvent["kind"]; matchCount?: number} {
    const matchCount = winMatchCount(win);
    if (win.type === "line") {
        const identity = symbolId ?? win.id;
        return {
            key: `line:${identity}:${matchCount ?? ""}`,
            label: matchCount === undefined ? `${identity} line win` : `${identity} × ${matchCount}`,
            kind: "line",
            ...(matchCount === undefined ? {} : {matchCount}),
        };
    }
    if (win.type === "scatter") {
        const identity = symbolId ?? win.id;
        return {
            key: `scatter:${identity}:${matchCount ?? ""}`,
            label: matchCount === undefined ? `Scatter ${identity}` : `Scatter ${identity} × ${matchCount}`,
            kind: "scatter",
            ...(matchCount === undefined ? {} : {matchCount}),
        };
    }
    const label = humanizeIdentifier(win.type);
    return {
        key: `other:${win.type}:${win.id}`,
        label: win.id === win.type ? label : `${label} · ${win.id}`,
        kind: "other",
        ...(matchCount === undefined ? {} : {matchCount}),
    };
}

function winMatchCount(win: RoundRecordWin<string>): number | undefined {
    const count = win.metadata.count;
    if (typeof count === "number" && Number.isFinite(count) && count >= 0) return count;
    const positions = win.metadata.symbolsPositions;
    if (Array.isArray(positions)) return positions.length;
    if (win.type === "line" || win.type === "scatter") return win.winningPositions.length;
    return undefined;
}

function humanizeIdentifier(value: string): string {
    const spaced = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").trim();
    return spaced.length === 0 ? value : spaced[0].toUpperCase() + spaced.slice(1).toLowerCase();
}

function toContributionTable(
    tallies: ReadonlyMap<string, ContributionTally>,
    kind: "line" | "symbol",
    maxRows: number,
): WeightedOutcomeWinContributionTable {
    const entries: WeightedOutcomeWinContribution[] = [...tallies.entries()].map(([key, tally]) => {
        let label: string;
        if (kind === "line") {
            const lineId = displayLineNumber(key.split(":")[1] ?? key);
            label = tally.symbolId === undefined ? `Line ${lineId}` : `Line ${lineId} · ${tally.symbolId}`;
        } else {
            label = tally.symbolId ?? key.replace(/^symbol:/, "");
        }
        return {
            kind,
            key,
            label,
            ...(tally.symbolId === undefined ? {} : {symbolId: tally.symbolId}),
            rtpContribution: tally.rtpContribution,
            hitFrequency: tally.hitWeight,
            outcomeCount: tally.outcomeCount,
        };
    });
    entries.sort((left, right) => right.rtpContribution - left.rtpContribution
        || (kind === "line" ? compareLineContributions(left, right) : left.label.localeCompare(right.label)));
    return {entries: entries.slice(0, maxRows), truncated: entries.length > maxRows};
}

/**
 * Round-record line ids are zero-based engine coordinates. Studio/PAR present paylines as the
 * one-based "Line 1 / Line 2" labels a game author actually sees, so only the display label is
 * translated here; the stable key and every contribution value remain unchanged.
 */
export function displayLineNumber(lineId: string): string {
    const numeric = Number(lineId);
    return Number.isInteger(numeric) && numeric >= 0 ? String(numeric + 1) : lineId;
}

function compareLineContributions(left: WeightedOutcomeWinContribution, right: WeightedOutcomeWinContribution): number {
    const leftId = Number(left.key.split(":")[1]);
    const rightId = Number(right.key.split(":")[1]);
    if (Number.isInteger(leftId) && Number.isInteger(rightId) && leftId !== rightId) return leftId - rightId;
    return left.label.localeCompare(right.label);
}

function toEventTable(tallies: ReadonlyMap<string, EventTally>, maxRows: number): WeightedOutcomeWinEventTable {
    const entries: WeightedOutcomeWinEvent[] = [...tallies.entries()].map(([key, tally]) => ({
        kind: tally.kind,
        key,
        label: tally.label,
        winType: tally.winType,
        winId: tally.winId,
        ...(tally.symbolId === undefined ? {} : {symbolId: tally.symbolId}),
        ...(tally.matchCount === undefined ? {} : {matchCount: tally.matchCount}),
        probability: tally.hitWeight,
        rtpContribution: tally.rtpContribution,
        outcomeCount: tally.outcomeCount,
    }));
    entries.sort((left, right) => right.probability - left.probability || left.label.localeCompare(right.label));
    return {entries: entries.slice(0, maxRows), truncated: entries.length > maxRows};
}
