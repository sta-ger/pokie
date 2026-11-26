// Pure summary of the current draft versus an imported PAR workbook, used by the import preview.
// Kept out of the React component so the text is unit-tested without a DOM.
type ModelSummary = Record<ModelSummaryKey, string>;
type ModelSummaryKey = "game" | "layout" | "symbols" | "reels" | "paytable" | "bets" | "freeGames";

const SUMMARY_LABELS: Record<ModelSummaryKey, string> = {
    game: "Game",
    layout: "Layout",
    symbols: "Symbols",
    reels: "Reel source",
    paytable: "Paytable",
    bets: "Available bets",
    freeGames: "Free games",
};

// The game name/id/version is identity, not a mathematical model difference. Keeping it separate
// stops a PAR preview from marking "Game: DIFFERENT" beside layout/paytable rows and implying the
// maths changed when only the label did.
const SUMMARY_KINDS: Record<ModelSummaryKey, "identity" | "math"> = {
    game: "identity",
    layout: "math",
    symbols: "math",
    reels: "math",
    paytable: "math",
    bets: "math",
    freeGames: "math",
};

const EMPTY_SUMMARY: ModelSummary = {
    game: "Unavailable",
    layout: "Unavailable",
    symbols: "Unavailable",
    reels: "Unavailable",
    paytable: "Unavailable",
    bets: "Unavailable",
    freeGames: "Unavailable",
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function countPaytableRows(value: unknown): number {
    const paytable = asRecord(value);
    if (paytable === undefined) return 0;
    return Object.values(paytable).reduce<number>(
        (count, payouts) =>
            count + (asRecord(payouts) === undefined ? 0 : Object.keys(payouts as Record<string, unknown>).length),
        0,
    );
}

function describeFreeGames(value: unknown): string {
    const mechanics = asRecord(value);
    const freeGames = asRecord(mechanics?.freeGames);
    if (freeGames === undefined) return "None";
    const scatter = typeof freeGames.scatterSymbol === "string" ? freeGames.scatterSymbol : "(no scatter)";
    const awards = asRecord(freeGames.awardsByCount);
    const awardText =
        awards === undefined
            ? "(no awards)"
            : Object.entries(awards)
                .map(([count, granted]) => `${count} → ${String(granted)}`)
                .join(", ");
    const cap = typeof freeGames.maxFreeGames === "number" && Number.isSafeInteger(freeGames.maxFreeGames)
        ? `; cap ${freeGames.maxFreeGames} free games per feature`
        : "";
    return `Scatter ${scatter}; ${awardText}${cap} (exact scatter counts; unlisted counts award 0)`;
}

function formatReelStrip(strip: unknown): string {
    if (!Array.isArray(strip)) return "(missing)";
    const symbols = strip.map((symbol) => String(symbol));
    return symbols.length <= 12 ? symbols.join(" ") : `${symbols.slice(0, 12).join(" ")} … (${symbols.length} stops)`;
}

// The summary deliberately uses counts so it stays short. When the counts match but the reel
// contents do not, a bare "different" badge is impossible to act on; name the first reel that
// actually changed and show both strips.
function describeReelDifference(current: unknown, imported: unknown): string | undefined {
    const beforeStrips = asRecord(current)?.reelStrips;
    const afterStrips = asRecord(imported)?.reelStrips;
    if (!Array.isArray(beforeStrips) || !Array.isArray(afterStrips)) return "Reel source differs.";
    const reelCount = Math.max(beforeStrips.length, afterStrips.length);
    for (let index = 0; index < reelCount; index++) {
        const before = beforeStrips[index];
        const after = afterStrips[index];
        if (JSON.stringify(before) === JSON.stringify(after)) continue;
        return `Reel ${index + 1}: ${formatReelStrip(before)} → ${formatReelStrip(after)}`;
    }
    return undefined;
}

function describeFreeGamesDifference(current: unknown, imported: unknown): string | undefined {
    const before = asRecord(asRecord(asRecord(current)?.mechanics)?.freeGames);
    const after = asRecord(asRecord(asRecord(imported)?.mechanics)?.freeGames);
    if (before === undefined || after === undefined) return "Free-games mechanic differs.";
    const describeCap = (freeGames: Record<string, unknown>): string =>
        typeof freeGames.maxFreeGames === "number" ? `${freeGames.maxFreeGames} free games` : "no cap";
    if (before.maxFreeGames !== after.maxFreeGames) {
        return `Free-games cap: ${describeCap(before)} → ${describeCap(after)}.`;
    }
    return "Free-games awards differ.";
}

function modelFingerprints(value: unknown): Record<ModelSummaryKey, unknown> {
    const blueprint = asRecord(value);
    if (blueprint === undefined) return {
        game: undefined,
        layout: undefined,
        symbols: undefined,
        reels: undefined,
        paytable: undefined,
        bets: undefined,
        freeGames: undefined,
    };
    const mechanics = asRecord(blueprint.mechanics);
    return {
        game: blueprint.info,
        layout: {reels: blueprint.reels, rows: blueprint.rows, paylines: blueprint.paylines},
        symbols: blueprint.symbols,
        reels: {
            reelStrips: blueprint.reelStrips,
            reelSequences: blueprint.reelSequences,
            reelStripGeneration: blueprint.reelStripGeneration,
            symbolWeights: blueprint.symbolWeights,
        },
        paytable: blueprint.paytable,
        bets: blueprint.availableBets,
        freeGames: mechanics?.freeGames,
    };
}

/** Human-readable model differences for the PAR import preview, before any Apply. */
export function describeParSheetImportModelSummary(
    current: unknown,
    imported: unknown,
): Array<{
    key: ModelSummaryKey;
    label: string;
    kind: "identity" | "math";
    current: string;
    imported: string;
    changed: boolean;
    /** Why the rows differ when the human-readable summary itself looks identical. */
    detail?: string;
}> {
    const summarize = (value: unknown): ModelSummary => {
        const blueprint = asRecord(value);
        if (blueprint === undefined) return EMPTY_SUMMARY;
        const info = asRecord(blueprint.info);
        const reels = typeof blueprint.reels === "number" ? blueprint.reels : undefined;
        const rows = typeof blueprint.rows === "number" ? blueprint.rows : undefined;
        const paylines = Array.isArray(blueprint.paylines) ? blueprint.paylines.length : 0;
        const strips = Array.isArray(blueprint.reelStrips) ? blueprint.reelStrips : undefined;
        const stripStops =
            strips?.reduce<number>((total, strip) => total + (Array.isArray(strip) ? strip.length : 0), 0) ?? 0;
        let reelSource = "Engine default";
        if (strips !== undefined) reelSource = `${strips.length} manual reel(s), ${stripStops} stop(s)`;
        else if (Array.isArray(blueprint.reelSequences)) reelSource = "Whole-sequence variants";
        else if (Array.isArray(blueprint.reelStripGeneration)) reelSource = "Per-reel generation";
        else if (asRecord(blueprint.symbolWeights) !== undefined) reelSource = "Shared symbol weights";
        const gameId = typeof info?.id === "string" ? info.id : "?";
        const gameVersion = typeof info?.version === "string" ? info.version : "?";
        const gameName = typeof info?.name === "string" ? info.name : "";
        const symbols = asStringArray(blueprint.symbols);
        const bets = Array.isArray(blueprint.availableBets) ? blueprint.availableBets.map(String) : [];
        return {
            game: `${gameId} v${gameVersion}${gameName.length > 0 ? ` — ${gameName}` : ""}`,
            layout:
                reels === undefined || rows === undefined
                    ? "Unavailable"
                    : `${reels} reels × ${rows} rows; ${paylines} payline(s)`,
            symbols: symbols.length === 0 ? "None" : symbols.join(", "),
            reels: reelSource,
            paytable: `${countPaytableRows(blueprint.paytable)} payout row(s)`,
            bets: bets.length === 0 ? "None" : bets.join(", "),
            freeGames: describeFreeGames(blueprint.mechanics),
        };
    };
    const before = summarize(current);
    const after = summarize(imported);
    const beforeFingerprints = modelFingerprints(current);
    const afterFingerprints = modelFingerprints(imported);
    return (Object.keys(SUMMARY_LABELS) as ModelSummaryKey[]).map((key) => {
        const changed = JSON.stringify(beforeFingerprints[key]) !== JSON.stringify(afterFingerprints[key]);
        let detail: string | undefined;
        if (changed) {
            if (key === "reels" && before[key] === after[key]) detail = describeReelDifference(current, imported);
            else if (key === "layout" && before[key] === after[key]) detail = "Payline rows differ.";
            else if (key === "paytable" && before[key] === after[key]) detail = "Payout multipliers differ.";
            else if (key === "bets" && before[key] === after[key]) detail = "Bet values or order differ.";
            else if (key === "symbols" && before[key] === after[key]) detail = "Symbol ids or order differ.";
            else if (key === "freeGames") detail = describeFreeGamesDifference(current, imported);
        }
        return {
            key,
            label: SUMMARY_LABELS[key],
            kind: SUMMARY_KINDS[key],
            current: before[key],
            imported: after[key],
            changed,
            ...(detail === undefined ? {} : {detail}),
        };
    });
}
