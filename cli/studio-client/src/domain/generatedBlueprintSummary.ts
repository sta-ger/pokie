// A short, human-readable description of a generated blueprint, before the creator commits it into
// the editor. The generated design is intentionally minimal (line pays, default paylines, no
// wilds/scatters/features), so the preview names both what exists and what is still missing rather
// than making the draft look like a finished game.
export type GeneratedBlueprintSummary = {
    name: string;
    board: string;
    symbols: string;
    wilds: string;
    scatters: string;
    paylines: string;
    winModel: string;
    bets: string;
    features: string[];
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asFiniteInteger(value: unknown): number | undefined {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asNumberArray(value: unknown): number[] {
    return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry)) : [];
}

export function describeGeneratedBlueprint(value: unknown): GeneratedBlueprintSummary {
    const blueprint = asRecord(value) ?? {};
    const info = asRecord(blueprint.info) ?? {};
    const reels = asFiniteInteger(blueprint.reels);
    const rows = asFiniteInteger(blueprint.rows);
    const symbols = asStringArray(blueprint.symbols);
    const wilds = asStringArray(blueprint.wilds);
    const scatters = asStringArray(blueprint.scatters);
    const authoredPaylines = Array.isArray(blueprint.paylines) ? blueprint.paylines.length : 0;
    const bets = asNumberArray(blueprint.availableBets);
    const winModel = asRecord(blueprint.winModel)?.type;
    const mechanics = asRecord(blueprint.mechanics) ?? {};
    const betModes = Array.isArray(blueprint.betModes) ? blueprint.betModes.length : 0;

    const features: string[] = [];
    if (wilds.length > 0) features.push("wilds");
    if (scatters.length > 0) features.push("scatters");
    if (winModel === "ways") features.push("ways wins");
    if (winModel === "clusters") features.push("cluster wins");
    if (asRecord(mechanics.freeGames) !== undefined) features.push("free games");
    if (asRecord(mechanics.holdAndWin) !== undefined) features.push("Hold & Win");
    if (asRecord(mechanics.jackpot) !== undefined) features.push("jackpot");
    if (asRecord(mechanics.modifiers) !== undefined) features.push("screen modifiers");
    if (betModes > 0) features.push(`${betModes} bet mode${betModes === 1 ? "" : "s"}`);

    const board = reels === undefined || rows === undefined
        ? "not specified"
        : `${reels} × ${rows}`;
    let paylineDescription: string;
    if (authoredPaylines > 0) {
        paylineDescription = `${authoredPaylines} authored`;
    } else if (rows === undefined) {
        paylineDescription = "engine default (one horizontal line per row)";
    } else {
        paylineDescription = `engine default (${rows} horizontal line${rows === 1 ? "" : "s"})`;
    }
    const symbolDescription = symbols.length === 0
        ? "not specified"
        : `${symbols.length} (${symbols.join(", ")})`;

    return {
        name: typeof info.name === "string" && info.name.trim().length > 0 ? info.name : "(unnamed)",
        board,
        symbols: symbolDescription,
        wilds: wilds.length === 0 ? "none" : wilds.join(", "),
        scatters: scatters.length === 0 ? "none" : scatters.join(", "),
        paylines: paylineDescription,
        winModel: typeof winModel === "string" ? winModel : "lines (default)",
        bets: bets.length === 0 ? "engine default" : bets.join(", "),
        features: features.length === 0 ? ["base line game only — no wilds, scatters, free games or bet modes yet"] : features,
    };
}
