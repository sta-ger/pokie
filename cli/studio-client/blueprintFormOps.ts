// Pure add/remove/duplicate/reorder operations the Blueprint Editor's Form view runs against a cloned
// blueprint (see blueprintEditorState.ts's withFieldUpdate) for every editable collection: symbols,
// wilds/scatters membership, availableBets, paylines, paytable rows, reelStrips (per-reel symbol
// lists), and symbolWeights rows. Every function mutates the given blueprint in place and returns
// nothing — withFieldUpdate is what turns that into a new, re-serialized state. Deliberately tolerant
// of a field being absent/malformed on the blueprint (defaults to an empty collection) so switching
// back to Form mode after an unusual JSON edit never throws.

function asStringArray(value: unknown): string[] {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asNumberArray(value: unknown): number[] {
    return Array.isArray(value) ? value.filter((item): item is number => typeof item === "number") : [];
}

function removeAt<T>(list: T[], index: number): T[] {
    return list.filter((_, i) => i !== index);
}

function moveItem<T>(list: T[], fromIndex: number, toIndex: number): T[] {
    if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) {
        return list;
    }
    const copy = [...list];
    const [item] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, item);
    return copy;
}

// ---- Symbols ----

export function addSymbol(blueprint: Record<string, unknown>, id: string): void {
    blueprint.symbols = [...asStringArray(blueprint.symbols), id];
}

export function setSymbolAt(blueprint: Record<string, unknown>, index: number, id: string): void {
    const symbols = [...asStringArray(blueprint.symbols)];
    symbols[index] = id;
    blueprint.symbols = symbols;
}

export function removeSymbolAt(blueprint: Record<string, unknown>, index: number): void {
    blueprint.symbols = removeAt(asStringArray(blueprint.symbols), index);
}

// A duplicated symbol id can never collide with an existing one (GameBlueprintValidator rejects
// duplicate ids) — appends "-copy" (then "-copy-2", "-copy-3", ...) until it's unique, giving the user
// a starting point to rename rather than an id they'd immediately have to fix a validation error for.
export function duplicateSymbolAt(blueprint: Record<string, unknown>, index: number): void {
    const symbols = asStringArray(blueprint.symbols);
    const original = symbols[index];
    if (original === undefined) {
        return;
    }
    const existing = new Set(symbols);
    let candidate = `${original}-copy`;
    let suffix = 2;
    while (existing.has(candidate)) {
        candidate = `${original}-copy-${suffix}`;
        suffix++;
    }
    const next = [...symbols];
    next.splice(index + 1, 0, candidate);
    blueprint.symbols = next;
}

export function moveSymbolAt(blueprint: Record<string, unknown>, fromIndex: number, toIndex: number): void {
    blueprint.symbols = moveItem(asStringArray(blueprint.symbols), fromIndex, toIndex);
}

function toggleMembership(blueprint: Record<string, unknown>, field: "wilds" | "scatters", id: string): void {
    const list = asStringArray(blueprint[field]);
    blueprint[field] = list.includes(id) ? list.filter((existing) => existing !== id) : [...list, id];
}

export function toggleWildSymbol(blueprint: Record<string, unknown>, id: string): void {
    toggleMembership(blueprint, "wilds", id);
}

export function toggleScatterSymbol(blueprint: Record<string, unknown>, id: string): void {
    toggleMembership(blueprint, "scatters", id);
}

// ---- Available bets ----

export function addBet(blueprint: Record<string, unknown>, value: number): void {
    blueprint.availableBets = [...asNumberArray(blueprint.availableBets), value];
}

export function setBetAt(blueprint: Record<string, unknown>, index: number, value: number): void {
    const bets = [...asNumberArray(blueprint.availableBets)];
    bets[index] = value;
    blueprint.availableBets = bets;
}

export function removeBetAt(blueprint: Record<string, unknown>, index: number): void {
    blueprint.availableBets = removeAt(asNumberArray(blueprint.availableBets), index);
}

export function duplicateBetAt(blueprint: Record<string, unknown>, index: number): void {
    const bets = asNumberArray(blueprint.availableBets);
    const value = bets[index];
    if (value === undefined) {
        return;
    }
    const next = [...bets];
    next.splice(index + 1, 0, value);
    blueprint.availableBets = next;
}

export function moveBetAt(blueprint: Record<string, unknown>, fromIndex: number, toIndex: number): void {
    blueprint.availableBets = moveItem(asNumberArray(blueprint.availableBets), fromIndex, toIndex);
}

// ---- Paylines ----

function asPaylines(value: unknown): number[][] {
    return Array.isArray(value) ? value.map((line) => asNumberArray(line)) : [];
}

function reelCount(blueprint: Record<string, unknown>): number {
    return typeof blueprint.reels === "number" && Number.isInteger(blueprint.reels) && blueprint.reels > 0 ? blueprint.reels : 1;
}

export function addPayline(blueprint: Record<string, unknown>): void {
    blueprint.paylines = [...asPaylines(blueprint.paylines), new Array(reelCount(blueprint)).fill(0)];
}

export function setPaylineCell(blueprint: Record<string, unknown>, lineIndex: number, reelIndex: number, row: number): void {
    const paylines = asPaylines(blueprint.paylines).map((line) => [...line]);
    if (paylines[lineIndex] === undefined) {
        return;
    }
    paylines[lineIndex][reelIndex] = row;
    blueprint.paylines = paylines;
}

export function removePaylineAt(blueprint: Record<string, unknown>, index: number): void {
    blueprint.paylines = removeAt(asPaylines(blueprint.paylines), index);
}

export function duplicatePaylineAt(blueprint: Record<string, unknown>, index: number): void {
    const paylines = asPaylines(blueprint.paylines);
    const line = paylines[index];
    if (line === undefined) {
        return;
    }
    const next = [...paylines];
    next.splice(index + 1, 0, [...line]);
    blueprint.paylines = next;
}

export function movePaylineAt(blueprint: Record<string, unknown>, fromIndex: number, toIndex: number): void {
    blueprint.paylines = moveItem(asPaylines(blueprint.paylines), fromIndex, toIndex);
}

// Keeps every existing payline's length in sync after `reels` changes — pads a shorter line with 0s,
// truncates a longer one — so a payline never silently holds a stale reel count the form no longer
// shows an input for.
export function resizePaylinesToReelCount(blueprint: Record<string, unknown>): void {
    const count = reelCount(blueprint);
    blueprint.paylines = asPaylines(blueprint.paylines).map((line) => {
        const resized = line.slice(0, count);
        while (resized.length < count) {
            resized.push(0);
        }
        return resized;
    });
}

// ---- Paytable (symbol -> matchCount -> payout) ----

function asPaytable(value: unknown): Record<string, Record<string, number>> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {};
    }
    const result: Record<string, Record<string, number>> = {};
    for (const [symbolId, payouts] of Object.entries(value as Record<string, unknown>)) {
        if (typeof payouts !== "object" || payouts === null || Array.isArray(payouts)) {
            continue;
        }
        const row: Record<string, number> = {};
        for (const [times, multiplier] of Object.entries(payouts as Record<string, unknown>)) {
            if (typeof multiplier === "number") {
                row[times] = multiplier;
            }
        }
        result[symbolId] = row;
    }
    return result;
}

export function setPaytablePayout(blueprint: Record<string, unknown>, symbolId: string, matchCount: number, payout: number): void {
    const paytable = asPaytable(blueprint.paytable);
    paytable[symbolId] = {...paytable[symbolId], [String(matchCount)]: payout};
    blueprint.paytable = paytable;
}

// Removes just this one matchCount entry — if that was the symbol's last entry, the symbol key itself
// is removed too (an empty payouts object is already rejected by GameBlueprintValidator).
export function removePaytablePayout(blueprint: Record<string, unknown>, symbolId: string, matchCount: number): void {
    const paytable = asPaytable(blueprint.paytable);
    const row = {...paytable[symbolId]};
    Reflect.deleteProperty(row, String(matchCount));
    if (Object.keys(row).length === 0) {
        Reflect.deleteProperty(paytable, symbolId);
    } else {
        paytable[symbolId] = row;
    }
    blueprint.paytable = paytable;
}

// A paytable row's "reorder"/"duplicate as a new row" doesn't map onto a plain array the way the other
// collections do (it's a nested map with no meaningful order) — "duplicate" here instead copies this
// row's payout into the next matchCount that symbol doesn't already have an entry for, up to
// `reels`, giving the user a same-value starting point for the next tier rather than a no-op.
export function duplicatePaytablePayout(blueprint: Record<string, unknown>, symbolId: string, matchCount: number, maxMatchCount: number): void {
    const paytable = asPaytable(blueprint.paytable);
    const row = paytable[symbolId];
    const payout = row?.[String(matchCount)];
    if (payout === undefined) {
        return;
    }
    for (let candidate = matchCount + 1; candidate <= maxMatchCount; candidate++) {
        if (!(String(candidate) in row)) {
            setPaytablePayout(blueprint, symbolId, candidate, payout);
            return;
        }
    }
}

// ---- Reel strips (one symbol-id list per reel) ----

function asReelStrips(value: unknown): string[][] {
    return Array.isArray(value) ? value.map((strip) => asStringArray(strip)) : [];
}

export function addReelStripSymbol(blueprint: Record<string, unknown>, reelIndex: number, symbolId: string): void {
    const strips = asReelStrips(blueprint.reelStrips).map((strip) => [...strip]);
    if (strips[reelIndex] === undefined) {
        return;
    }
    strips[reelIndex].push(symbolId);
    blueprint.reelStrips = strips;
}

export function setReelStripSymbolAt(blueprint: Record<string, unknown>, reelIndex: number, position: number, symbolId: string): void {
    const strips = asReelStrips(blueprint.reelStrips).map((strip) => [...strip]);
    if (strips[reelIndex] === undefined) {
        return;
    }
    strips[reelIndex][position] = symbolId;
    blueprint.reelStrips = strips;
}

export function removeReelStripSymbolAt(blueprint: Record<string, unknown>, reelIndex: number, position: number): void {
    const strips = asReelStrips(blueprint.reelStrips);
    if (strips[reelIndex] === undefined) {
        return;
    }
    strips[reelIndex] = removeAt(strips[reelIndex], position);
    blueprint.reelStrips = strips;
}

export function duplicateReelStripSymbolAt(blueprint: Record<string, unknown>, reelIndex: number, position: number): void {
    const strips = asReelStrips(blueprint.reelStrips).map((strip) => [...strip]);
    const strip = strips[reelIndex];
    if (strip === undefined || strip[position] === undefined) {
        return;
    }
    strip.splice(position + 1, 0, strip[position]);
    blueprint.reelStrips = strips;
}

export function moveReelStripSymbolAt(blueprint: Record<string, unknown>, reelIndex: number, fromPosition: number, toPosition: number): void {
    const strips = asReelStrips(blueprint.reelStrips);
    if (strips[reelIndex] === undefined) {
        return;
    }
    strips[reelIndex] = moveItem(strips[reelIndex], fromPosition, toPosition);
    blueprint.reelStrips = strips;
}

// Keeps reelStrips' outer array length in sync with `reels` — a newly added reel gets an empty strip,
// a removed reel's strip is dropped — same reasoning as resizePaylinesToReelCount.
export function resizeReelStripsToReelCount(blueprint: Record<string, unknown>): void {
    if (blueprint.reelStrips === undefined) {
        return;
    }
    const count = reelCount(blueprint);
    const strips = asReelStrips(blueprint.reelStrips);
    const resized = strips.slice(0, count);
    while (resized.length < count) {
        resized.push([]);
    }
    blueprint.reelStrips = resized;
}

// ---- Symbol weights (symbol -> weight) ----

function asSymbolWeights(value: unknown): Record<string, number> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {};
    }
    const result: Record<string, number> = {};
    for (const [symbolId, weight] of Object.entries(value as Record<string, unknown>)) {
        if (typeof weight === "number") {
            result[symbolId] = weight;
        }
    }
    return result;
}

export function setSymbolWeight(blueprint: Record<string, unknown>, symbolId: string, weight: number): void {
    blueprint.symbolWeights = {...asSymbolWeights(blueprint.symbolWeights), [symbolId]: weight};
}

export function removeSymbolWeight(blueprint: Record<string, unknown>, symbolId: string): void {
    const weights = {...asSymbolWeights(blueprint.symbolWeights)};
    Reflect.deleteProperty(weights, symbolId);
    blueprint.symbolWeights = weights;
}

// ---- Reel generation mode (reelStrips vs symbolWeights are mutually exclusive in practice) ----

export type ReelGenerationMode = "reelStrips" | "symbolWeights" | "default";

export function getReelGenerationMode(blueprint: Record<string, unknown>): ReelGenerationMode {
    if (blueprint.reelStrips !== undefined) {
        return "reelStrips";
    }
    if (blueprint.symbolWeights !== undefined) {
        return "symbolWeights";
    }
    return "default";
}

// Switching modes clears the field for the mode being left, so the blueprint never ends up carrying
// both at once by accident (GameBlueprintValidator only warns about that, doesn't block it, but the
// editor's own toggle is meant to make the choice explicit and exclusive).
export function setReelGenerationMode(blueprint: Record<string, unknown>, mode: ReelGenerationMode): void {
    if (mode === "reelStrips") {
        blueprint.reelStrips = blueprint.reelStrips !== undefined ? asReelStrips(blueprint.reelStrips) : new Array(reelCount(blueprint)).fill([]).map(() => []);
        Reflect.deleteProperty(blueprint, "symbolWeights");
    } else if (mode === "symbolWeights") {
        blueprint.symbolWeights = blueprint.symbolWeights !== undefined ? asSymbolWeights(blueprint.symbolWeights) : {};
        Reflect.deleteProperty(blueprint, "reelStrips");
    } else {
        Reflect.deleteProperty(blueprint, "reelStrips");
        Reflect.deleteProperty(blueprint, "symbolWeights");
    }
}
