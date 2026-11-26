import type {MathDefinitionChange, MathDefinitionValue} from "../../../../src/diff/MathDefinitionDiff.js";

// Human-readable names for the definition-diff paths a math author actually reviews. The raw RFC 6901
// pointer stays available in the technical disclosure; the main comparison should read like a game
// model, not like a JSON patch. Unknown paths stay deterministic and still show the path segments rather
// than silently collapsing to a generic label.
const SEGMENT_LABELS: Record<string, string> = {
    info: "Metadata",
    manifest: "Metadata",
    id: "Game id",
    name: "Game name",
    version: "Version",
    description: "Description",
    author: "Author",
    reels: "Reels",
    rows: "Rows",
    symbols: "Symbols",
    wilds: "Wilds",
    scatters: "Scatters",
    paytable: "Paytable",
    paylines: "Paylines",
    winModel: "Win model",
    minimumClusterSize: "Minimum cluster size",
    availableBets: "Available bets",
    betModes: "Bet modes",
    mechanics: "Mechanics",
    freeGames: "Free games",
    awardsByCount: "Free-games awards",
    scatterSymbol: "Scatter symbol",
    retriggerPolicy: "Retrigger policy",
    reelStrips: "Reel strips",
    reelSequences: "Reel sequences",
    reelStripGeneration: "Generated reels",
    weightedBonus: "Weighted bonus",
    cascade: "Cascades",
    respins: "Respins",
    collection: "Collection",
    modifiers: "Wild modifiers",
    holdAndWin: "Hold & Win",
    jackpot: "Jackpot",
    maxWinPolicy: "Max-win policy",
    value: "Value",
    type: "Type",
};

function titleCase(value: string): string {
    const words = value
        .replace((/([a-z0-9])([A-Z])/g), "$1 $2")
        .replace((/[-_]+/g), " ")
        .trim();
    return words.length === 0 ? value : words[0].toUpperCase() + words.slice(1);
}

function label(segment: string): string {
    return SEGMENT_LABELS[segment] ?? titleCase(segment);
}

function oneBased(value: string | undefined): string | undefined {
    if (value === undefined || !(/^\d+$/).test(value)) return undefined;
    return String(Number(value) + 1);
}

function scalar(value: MathDefinitionValue | undefined): string | undefined {
    if (value === undefined || !value.present) return undefined;
    return typeof value.value === "string" || typeof value.value === "number" ? String(value.value) : undefined;
}

/**
 * Describes a definition change without exposing JSON-pointer syntax in the main comparison table.
 * Context values from the server (symbol id, match count, reel index) win over raw path decoding.
 */
export function describeDefinitionChangePath(
    change: Pick<MathDefinitionChange, "path"> & Partial<Pick<MathDefinitionChange, "context" | "before" | "after">>,
): string {
    const keys = change.path.split("/").filter(Boolean);
    if (keys.length === 0) return "Game definition";
    if (keys[0] === "info" || keys[0] === "manifest") {
        return `Metadata · ${label(keys[1] ?? "info")}`;
    }
    if ((keys[0] === "symbols" || keys[0] === "scatters" || keys[0] === "wilds") && (/^\d+$/).test(keys[1] ?? "")) {
        const value = scalar(change.after) ?? scalar(change.before);
        if (value !== undefined) return `${label(keys[0])} · ${value}`;
    }
    if (keys[0] === "paytable") {
        const symbol = change.context?.after.symbolId ?? change.context?.before.symbolId ?? keys[1] ?? "symbol";
        const matchCount = change.context?.after.matchCount ?? change.context?.before.matchCount ?? keys[2];
        return `${label("paytable")} · ${String(symbol)}${matchCount === undefined ? "" : `, ${String(matchCount)} symbols`}`;
    }
    if (keys[0] === "reelStrips" || keys[0] === "reelStripGeneration") {
        const reel = oneBased(keys[1]);
        const stop = oneBased(keys[2]);
        return `${label(keys[0])}${reel === undefined ? "" : ` · Reel ${reel}`}${stop === undefined ? "" : ` · Stop ${stop}`}`;
    }
    if (keys[0] === "reelSequences") {
        const reel = oneBased(keys[1]);
        return `${label("reelSequences")}${reel === undefined ? "" : ` · Reel ${reel}`}`;
    }
    if (keys[0] === "mechanics" && keys[1] === "freeGames") {
        if (keys[2] === "awardsByCount" && keys[3] !== undefined) {
            return `Free games · ${keys[3]}-scatter award`;
        }
        return `Free games · ${label(keys[2] ?? "settings")}`;
    }
    if (keys[0] === "mechanics") {
        return `${label("mechanics")} · ${keys.slice(1).map(label).join(" · ") || "settings"}`;
    }
    if (keys[0] === "paylines") {
        const line = oneBased(keys[1]);
        const reel = oneBased(keys[2]);
        return `Paylines${line === undefined ? "" : ` · Line ${line}`}${reel === undefined ? "" : ` · Reel ${reel}`}`;
    }
    if (keys[0] === "betModes") {
        const modeId = change.context?.after.modeId ?? change.context?.before.modeId;
        return `Bet modes · ${modeId === undefined ? titleCase(keys[1] ?? "mode") : String(modeId)}${keys[2] === undefined ? "" : ` · ${label(keys[2])}`}`;
    }
    return keys.map(label).join(" · ");
}
