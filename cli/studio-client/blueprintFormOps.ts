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

// ---- Reel strip generation (per-reel: each reel independently "literal" or "generated") ----
//
// Unlike reelStrips/symbolWeights (one shared shape for every reel), reelStripGeneration is an array
// with exactly one entry per reel, each independently {type: "literal", strip} or {type: "generated",
// length, seed, symbolCounts-or-symbolWeights, lockedPositions?, constraints?, maxAttempts?, ...} — see
// src/generated/ReelStripGenerationSpec.ts. Every mutator below reads/writes one reel's own entry by
// index, tolerant of a missing/malformed entry the same way the rest of this file is elsewhere.

function asReelStripGenerationEntries(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value)
        ? value.map((entry) => (typeof entry === "object" && entry !== null && !Array.isArray(entry) ? (entry as Record<string, unknown>) : {type: "literal", strip: []}))
        : [];
}

function withReelStripGenerationEntry(
    blueprint: Record<string, unknown>,
    reelIndex: number,
    update: (entry: Record<string, unknown>) => Record<string, unknown>,
): void {
    const entries = asReelStripGenerationEntries(blueprint.reelStripGeneration);
    if (entries[reelIndex] === undefined) {
        return;
    }
    const next = [...entries];
    next[reelIndex] = update(entries[reelIndex]);
    blueprint.reelStripGeneration = next;
}

function asNumberRecord(value: unknown): Record<string, number> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {};
    }
    const result: Record<string, number> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (typeof val === "number") {
            result[key] = val;
        }
    }
    return result;
}

export function setReelStripGenerationEntryType(blueprint: Record<string, unknown>, reelIndex: number, type: "literal" | "generated"): void {
    withReelStripGenerationEntry(blueprint, reelIndex, () =>
        type === "literal" ? {type: "literal", strip: []} : {type: "generated", length: 1, seed: 1, symbolCounts: {}},
    );
}

// ---- Literal entries: the same per-symbol operations as top-level reelStrips, addressed by reelIndex ----

export function addReelStripGenerationLiteralSymbol(blueprint: Record<string, unknown>, reelIndex: number, symbolId: string): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => ({...entry, strip: [...asStringArray(entry.strip), symbolId]}));
}

export function setReelStripGenerationLiteralSymbolAt(blueprint: Record<string, unknown>, reelIndex: number, position: number, symbolId: string): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => {
        const strip = [...asStringArray(entry.strip)];
        strip[position] = symbolId;
        return {...entry, strip};
    });
}

export function removeReelStripGenerationLiteralSymbolAt(blueprint: Record<string, unknown>, reelIndex: number, position: number): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => ({...entry, strip: removeAt(asStringArray(entry.strip), position)}));
}

export function duplicateReelStripGenerationLiteralSymbolAt(blueprint: Record<string, unknown>, reelIndex: number, position: number): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => {
        const strip = [...asStringArray(entry.strip)];
        if (strip[position] === undefined) {
            return entry;
        }
        strip.splice(position + 1, 0, strip[position]);
        return {...entry, strip};
    });
}

export function moveReelStripGenerationLiteralSymbolAt(blueprint: Record<string, unknown>, reelIndex: number, fromPosition: number, toPosition: number): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => ({...entry, strip: moveItem(asStringArray(entry.strip), fromPosition, toPosition)}));
}

// ---- Generated entries: length/seed/maxAttempts, symbolCounts-or-symbolWeights, lockedPositions, constraints ----

export function setReelStripGenerationLength(blueprint: Record<string, unknown>, reelIndex: number, length: number): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => ({...entry, length}));
}

export function setReelStripGenerationSeed(blueprint: Record<string, unknown>, reelIndex: number, seed: number): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => ({...entry, seed}));
}

// `undefined` removes maxAttempts entirely (it's optional -- falls back to ReelStripGenerator's own default).
export function setReelStripGenerationMaxAttempts(blueprint: Record<string, unknown>, reelIndex: number, maxAttempts: number | undefined): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => {
        const next = {...entry};
        if (maxAttempts === undefined) {
            Reflect.deleteProperty(next, "maxAttempts");
        } else {
            next.maxAttempts = maxAttempts;
        }
        return next;
    });
}

export type ReelStripGenerationSourceMode = "symbolCounts" | "symbolWeights";

export function getReelStripGenerationSourceMode(entry: Record<string, unknown>): ReelStripGenerationSourceMode {
    return entry.symbolWeights !== undefined ? "symbolWeights" : "symbolCounts";
}

// Exactly one of symbolCounts/symbolWeights may be set (mirrors the top-level reelStrips/symbolWeights
// exclusivity) -- switching preserves whatever was already entered under the mode being kept.
export function setReelStripGenerationSourceMode(blueprint: Record<string, unknown>, reelIndex: number, mode: ReelStripGenerationSourceMode): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => {
        const next = {...entry};
        if (mode === "symbolCounts") {
            next.symbolCounts = asNumberRecord(entry.symbolCounts);
            Reflect.deleteProperty(next, "symbolWeights");
        } else {
            next.symbolWeights = asNumberRecord(entry.symbolWeights);
            Reflect.deleteProperty(next, "symbolCounts");
        }
        return next;
    });
}

export function setReelStripGenerationSymbolCount(blueprint: Record<string, unknown>, reelIndex: number, symbolId: string, count: number): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => ({...entry, symbolCounts: {...asNumberRecord(entry.symbolCounts), [symbolId]: count}}));
}

export function removeReelStripGenerationSymbolCount(blueprint: Record<string, unknown>, reelIndex: number, symbolId: string): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => {
        const counts = {...asNumberRecord(entry.symbolCounts)};
        Reflect.deleteProperty(counts, symbolId);
        return {...entry, symbolCounts: counts};
    });
}

export function setReelStripGenerationSymbolWeight(blueprint: Record<string, unknown>, reelIndex: number, symbolId: string, weight: number): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => ({...entry, symbolWeights: {...asNumberRecord(entry.symbolWeights), [symbolId]: weight}}));
}

export function removeReelStripGenerationSymbolWeight(blueprint: Record<string, unknown>, reelIndex: number, symbolId: string): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => {
        const weights = {...asNumberRecord(entry.symbolWeights)};
        Reflect.deleteProperty(weights, symbolId);
        return {...entry, symbolWeights: weights};
    });
}

function asLockedPositions(value: unknown): Record<string, string> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return {};
    }
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (typeof val === "string") {
            result[key] = val;
        }
    }
    return result;
}

export function setReelStripGenerationLockedPosition(blueprint: Record<string, unknown>, reelIndex: number, position: number, symbolId: string): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => ({
        ...entry,
        lockedPositions: {...asLockedPositions(entry.lockedPositions), [String(position)]: symbolId},
    }));
}

export function removeReelStripGenerationLockedPosition(blueprint: Record<string, unknown>, reelIndex: number, position: number): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => {
        const locked = {...asLockedPositions(entry.lockedPositions)};
        Reflect.deleteProperty(locked, String(position));
        return {...entry, lockedPositions: locked};
    });
}

// Constraints are edited as a raw JSON array (ReelStripConstraintSpec[]) rather than one bespoke
// widget per constraint type -- there are seven types with quite different fields (see
// src/generated/ReelStripConstraintSpec.ts), and the Blueprint Editor already has a JSON-editing
// affordance elsewhere (the whole-blueprint JSON view) whose shape errors surface the same way, via
// the existing Validate action. This parser is pure/side-effect-free so a failed parse can be shown
// inline without touching the blueprint -- see setReelStripGenerationConstraints for the actual mutator.
export function parseReelStripGenerationConstraintsJson(jsonText: string): {ok: true; constraints: unknown[]} | {ok: false; error: string} {
    if (jsonText.trim().length === 0) {
        return {ok: true, constraints: []};
    }
    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText);
    } catch (error) {
        return {ok: false, error: error instanceof Error ? error.message : String(error)};
    }
    if (!Array.isArray(parsed)) {
        return {ok: false, error: "Constraints must be a JSON array."};
    }
    return {ok: true, constraints: parsed};
}

export function setReelStripGenerationConstraints(blueprint: Record<string, unknown>, reelIndex: number, constraints: unknown[]): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => {
        const next = {...entry};
        if (constraints.length === 0) {
            Reflect.deleteProperty(next, "constraints");
        } else {
            next.constraints = constraints;
        }
        return next;
    });
}

// Keeps the outer array length in sync with `reels` -- same reasoning as resizeReelStripsToReelCount.
export function resizeReelStripGenerationToReelCount(blueprint: Record<string, unknown>): void {
    if (blueprint.reelStripGeneration === undefined) {
        return;
    }
    const count = reelCount(blueprint);
    const entries = asReelStripGenerationEntries(blueprint.reelStripGeneration);
    const resized = entries.slice(0, count);
    while (resized.length < count) {
        resized.push({type: "literal", strip: []});
    }
    blueprint.reelStripGeneration = resized;
}

// ---- Reel generation mode (reelStrips/reelStripGeneration/symbolWeights are mutually exclusive in practice) ----

export type ReelGenerationMode = "reelStrips" | "reelStripGeneration" | "symbolWeights" | "default";

export function getReelGenerationMode(blueprint: Record<string, unknown>): ReelGenerationMode {
    if (blueprint.reelStrips !== undefined) {
        return "reelStrips";
    }
    if (blueprint.reelStripGeneration !== undefined) {
        return "reelStripGeneration";
    }
    if (blueprint.symbolWeights !== undefined) {
        return "symbolWeights";
    }
    return "default";
}

// Switching modes clears the fields for every mode being left, so the blueprint never ends up carrying
// more than one at once by accident (GameBlueprintValidator only warns/errors about that combination,
// doesn't always block it, but the editor's own toggle is meant to make the choice explicit and
// exclusive).
export function setReelGenerationMode(blueprint: Record<string, unknown>, mode: ReelGenerationMode): void {
    if (mode === "reelStrips") {
        blueprint.reelStrips = blueprint.reelStrips !== undefined ? asReelStrips(blueprint.reelStrips) : new Array(reelCount(blueprint)).fill([]).map(() => []);
        Reflect.deleteProperty(blueprint, "reelStripGeneration");
        Reflect.deleteProperty(blueprint, "symbolWeights");
    } else if (mode === "reelStripGeneration") {
        blueprint.reelStripGeneration =
            blueprint.reelStripGeneration !== undefined
                ? asReelStripGenerationEntries(blueprint.reelStripGeneration)
                : new Array(reelCount(blueprint)).fill(null).map(() => ({type: "literal", strip: []}));
        Reflect.deleteProperty(blueprint, "reelStrips");
        Reflect.deleteProperty(blueprint, "symbolWeights");
    } else if (mode === "symbolWeights") {
        blueprint.symbolWeights = blueprint.symbolWeights !== undefined ? asSymbolWeights(blueprint.symbolWeights) : {};
        Reflect.deleteProperty(blueprint, "reelStrips");
        Reflect.deleteProperty(blueprint, "reelStripGeneration");
    } else {
        Reflect.deleteProperty(blueprint, "reelStrips");
        Reflect.deleteProperty(blueprint, "reelStripGeneration");
        Reflect.deleteProperty(blueprint, "symbolWeights");
    }
}
