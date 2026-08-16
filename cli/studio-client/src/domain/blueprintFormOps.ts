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
    const previousId = symbols[index];
    if (previousId === undefined || previousId === id) {
        symbols[index] = id;
        blueprint.symbols = symbols;
        return;
    }
    renameSymbol(blueprint, previousId, id);
}

export function removeSymbolAt(blueprint: Record<string, unknown>, index: number): void {
    const id = asStringArray(blueprint.symbols)[index];
    if (id === undefined || getSymbolDeletionBlockers(blueprint, id).length > 0) {
        return;
    }
    blueprint.symbols = removeAt(asStringArray(blueprint.symbols), index);
    for (const field of ["wilds", "scatters"] as const) {
        blueprint[field] = asStringArray(blueprint[field]).filter((symbolId) => symbolId !== id);
    }
}

// Symbol ids are foreign keys throughout a Blueprint, rather than display-only labels.  Keep the
// rename in one place so editing Symbols cannot leave a reel, paytable, generated-reel config, or
// free-games trigger pointing to the old id.  Invalid target ids deliberately do nothing: the
// component reports the returned diagnostic and the existing value remains the persisted truth.
export function renameSymbol(blueprint: Record<string, unknown>, from: string, to: string): string | undefined {
    const symbols = asStringArray(blueprint.symbols);
    if (to.trim().length === 0) {
        return "A symbol id cannot be empty.";
    }
    if (from !== to && symbols.includes(to)) {
        return `Cannot rename "${from}" to "${to}": that symbol id already exists.`;
    }
    if (!symbols.includes(from)) {
        return `Cannot rename "${from}": the symbol no longer exists.`;
    }

    blueprint.symbols = symbols.map((id) => (id === from ? to : id));
    for (const field of ["wilds", "scatters"] as const) {
        blueprint[field] = asStringArray(blueprint[field]).map((id) => (id === from ? to : id));
    }
    renameRecordKey(blueprint, "paytable", from, to);
    renameRecordKey(blueprint, "symbolWeights", from, to);
    renameRecordKey(blueprint, "symbolArtwork", from, to);
    if (Array.isArray(blueprint.reelStrips)) {
        blueprint.reelStrips = asReelStrips(blueprint.reelStrips).map((strip) => strip.map((id) => (id === from ? to : id)));
    }
    renameGeneratedReelReferences(blueprint, from, to);
    const mechanics = asMechanics(blueprint.mechanics);
    const freeGames = asFreeGames(mechanics.freeGames);
    if (freeGames?.scatterSymbol === from) {
        mechanics.freeGames = {...freeGames, scatterSymbol: to};
        blueprint.mechanics = mechanics;
    }
    return undefined;
}

// Deleting a referenced symbol is intentionally blocked, not guessed at.  Renaming is safe because
// every known reference can be updated; deletion would require inventing replacement reel symbols or
// payout semantics.  Membership-only references are removed automatically by removeSymbolAt().
export function getSymbolDeletionBlockers(blueprint: Record<string, unknown>, id: string): string[] {
    const blockers: string[] = [];
    if (id in asPaytable(blueprint.paytable)) blockers.push("paytable");
    if (Object.prototype.hasOwnProperty.call(asSymbolWeights(blueprint.symbolWeights), id)) blockers.push("symbolWeights");
    asReelStrips(blueprint.reelStrips).forEach((strip, reelIndex) => {
        if (strip.includes(id)) blockers.push(`reelStrips[${reelIndex}]`);
    });
    asReelStripGenerationEntries(blueprint.reelStripGeneration).forEach((entry, reelIndex) => {
        if (entry.type === "literal" && asStringArray(entry.strip).includes(id)) blockers.push(`reelStripGeneration[${reelIndex}].strip`);
        if (entry.type === "generated") {
            for (const field of ["symbolCounts", "symbolWeights", "lockedPositions"] as const) {
                const values = field === "lockedPositions" ? asLockedPositions(entry[field]) : asNumberRecord(entry[field]);
                if (Object.prototype.hasOwnProperty.call(values, id) || Object.values(values).includes(id)) blockers.push(`reelStripGeneration[${reelIndex}].${field}`);
            }
            if (containsSymbolReference(entry.constraints, id)) blockers.push(`reelStripGeneration[${reelIndex}].constraints`);
        }
    });
    const freeGames = asFreeGames(asMechanics(blueprint.mechanics).freeGames);
    if (freeGames?.scatterSymbol === id) blockers.push("mechanics.freeGames.scatterSymbol");
    return blockers;
}

function renameRecordKey(blueprint: Record<string, unknown>, field: string, from: string, to: string): void {
    const value = blueprint[field];
    if (typeof value !== "object" || value === null || Array.isArray(value) || !Object.prototype.hasOwnProperty.call(value, from)) return;
    const record = {...(value as Record<string, unknown>)};
    const moved = record[from];
    Reflect.deleteProperty(record, from);
    record[to] = moved;
    blueprint[field] = record;
}

function renameGeneratedReelReferences(blueprint: Record<string, unknown>, from: string, to: string): void {
    if (!Array.isArray(blueprint.reelStripGeneration)) return;
    blueprint.reelStripGeneration = asReelStripGenerationEntries(blueprint.reelStripGeneration).map((entry) => {
        if (entry.type === "literal") return {...entry, strip: asStringArray(entry.strip).map((id) => (id === from ? to : id))};
        const next = {...entry};
        for (const field of ["symbolCounts", "symbolWeights"] as const) {
            if (next[field] !== undefined) {
                const values = {...asNumberRecord(next[field])};
                if (Object.prototype.hasOwnProperty.call(values, from)) {
                    values[to] = values[from];
                    Reflect.deleteProperty(values, from);
                    next[field] = values;
                }
            }
        }
        const locked = asLockedPositions(next.lockedPositions);
        if (Object.values(locked).includes(from)) {
            next.lockedPositions = Object.fromEntries(Object.entries(locked).map(([position, id]) => [position, id === from ? to : id]));
        }
        if (next.constraints !== undefined) next.constraints = replaceSymbolReference(next.constraints, from, to);
        return next;
    });
}

function containsSymbolReference(value: unknown, id: string): boolean {
    if (typeof value === "string") return value === id;
    if (Array.isArray(value)) return value.some((item) => containsSymbolReference(item, id));
    return typeof value === "object" && value !== null && Object.entries(value).some(([key, item]) => key !== "type" && (key === id || containsSymbolReference(item, id)));
}

function replaceSymbolReference(value: unknown, from: string, to: string): unknown {
    if (typeof value === "string") return value === from ? to : value;
    if (Array.isArray(value)) return value.map((item) => replaceSymbolReference(item, from, to));
    if (typeof value !== "object" || value === null) return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key === from ? to : key, key === "type" ? item : replaceSymbolReference(item, from, to)]));
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
    if (list.includes(id)) {
        blueprint[field] = list.filter((existing) => existing !== id);
        return;
    }
    // GameBlueprintValidator deliberately rejects a wild/scatter overlap: neither the generator nor
    // the runtime has an unambiguous special-symbol precedence.  Selecting one kind therefore clears
    // the other rather than creating a draft that can never be saved.
    const opposite = field === "wilds" ? "scatters" : "wilds";
    blueprint[opposite] = asStringArray(blueprint[opposite]).filter((existing) => existing !== id);
    blueprint[field] = [...list, id];
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

// ---- Bet modes ----

export type BlueprintBetMode = {
    id: string;
    label?: string;
    costMultiplier?: number;
    targetRtp?: number;
    runtimeType?: "base" | "ante" | "buyFeature";
    isDefault?: boolean;
    forcedFreeGames?: number;
};

function asBetModes(value: unknown): BlueprintBetMode[] {
    if (!Array.isArray(value)) return [];
    return value.filter((mode): mode is BlueprintBetMode => typeof mode === "object" && mode !== null && !Array.isArray(mode)).map((mode) => ({...(mode as BlueprintBetMode)}));
}

export function addBetMode(blueprint: Record<string, unknown>): void {
    const modes = asBetModes(blueprint.betModes);
    const ids = new Set(modes.map((mode) => mode.id));
    let number = 1;
    while (ids.has(`mode-${number}`)) number++;
    blueprint.betModes = [...modes, {id: `mode-${number}`, label: `Mode ${number}`}];
}

export function updateBetMode(blueprint: Record<string, unknown>, index: number, update: Partial<BlueprintBetMode>): void {
    const modes = asBetModes(blueprint.betModes);
    if (modes[index] === undefined) return;
    modes[index] = {...modes[index], ...update};
    blueprint.betModes = modes;
}

export function removeBetModeAt(blueprint: Record<string, unknown>, index: number): void {
    blueprint.betModes = removeAt(asBetModes(blueprint.betModes), index);
}

export function duplicateBetModeAt(blueprint: Record<string, unknown>, index: number): void {
    const modes = asBetModes(blueprint.betModes);
    const source = modes[index];
    if (source === undefined) return;
    const existing = new Set(modes.map((mode) => mode.id));
    let suffix = 2;
    let id = `${source.id}-copy`;
    while (existing.has(id)) id = `${source.id}-copy-${suffix++}`;
    modes.splice(index + 1, 0, {...source, id, isDefault: false});
    blueprint.betModes = modes;
}

export function moveBetModeAt(blueprint: Record<string, unknown>, fromIndex: number, toIndex: number): void {
    blueprint.betModes = moveItem(asBetModes(blueprint.betModes), fromIndex, toIndex);
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

// Applies a preset's or a saved custom set's lines (see paylinePresets.ts / customPaylineSets.ts) onto
// the blueprint's paylines. "replace" swaps the whole list; "append" only ever adds to it — neither mode
// touches an existing line in place, so a manually-tuned payline already on the blueprint is never
// silently lost.
export function applyPaylineSet(blueprint: Record<string, unknown>, lines: number[][], mode: "replace" | "append"): void {
    const incoming = lines.map((line) => [...line]);
    blueprint.paylines = mode === "replace" ? incoming : [...asPaylines(blueprint.paylines), ...incoming];
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

// ---- Mechanics (scatter-triggered free games) ----

function asMechanics(value: unknown): Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? {...(value as Record<string, unknown>)} : {};
}

function asFreeGames(value: unknown): {scatterSymbol?: unknown; awardsByCount?: unknown} | undefined {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? {...(value as Record<string, unknown>)} : undefined;
}

// Read-only helper for the Mechanics section's own field editor (FreeGamesFieldset.tsx) -- pulls a
// typed, defaulted `{scatterSymbol, awardsByCount}` out of an untyped blueprint, or `undefined` if this
// blueprint has no scatter-triggered free games configured at all (the "not every blueprint has this
// mechanic" case GameModelSections' own read-only MechanicsSection already renders as "No
// mechanics/features configured."). Mutations still go exclusively through the functions below.
export function readFreeGames(blueprint: Record<string, unknown>): {scatterSymbol: string; awardsByCount: Record<string, number>} | undefined {
    const freeGames = asFreeGames(asMechanics(blueprint.mechanics).freeGames);
    if (freeGames === undefined) {
        return undefined;
    }
    return {
        scatterSymbol: typeof freeGames.scatterSymbol === "string" ? freeGames.scatterSymbol : "",
        awardsByCount: asNumberRecord(freeGames.awardsByCount),
    };
}

// Turns this mechanic on, starting from nothing (no scatter symbol, no awards yet) -- the same
// "start editable, then fill in" pattern addBet/addPayline already follow for their own optional
// collections.
export function addFreeGames(blueprint: Record<string, unknown>): void {
    const mechanics = asMechanics(blueprint.mechanics);
    mechanics.freeGames = {scatterSymbol: "", awardsByCount: {}};
    blueprint.mechanics = mechanics;
}

// Turns this mechanic off outright -- removes `freeGames` (not just its fields), same as how a
// GameBlueprint that never had this mechanic represents "no free games", never an empty-but-present
// object standing in for absence.
export function removeFreeGames(blueprint: Record<string, unknown>): void {
    const mechanics = asMechanics(blueprint.mechanics);
    Reflect.deleteProperty(mechanics, "freeGames");
    blueprint.mechanics = mechanics;
}

export function setFreeGamesScatterSymbol(blueprint: Record<string, unknown>, symbolId: string): void {
    const mechanics = asMechanics(blueprint.mechanics);
    const freeGames = asFreeGames(mechanics.freeGames) ?? {};
    mechanics.freeGames = {...freeGames, scatterSymbol: symbolId};
    blueprint.mechanics = mechanics;
}

export function setFreeGamesAward(blueprint: Record<string, unknown>, matchCount: number, awarded: number): void {
    const mechanics = asMechanics(blueprint.mechanics);
    const freeGames = asFreeGames(mechanics.freeGames) ?? {};
    const awardsByCount = asNumberRecord(freeGames.awardsByCount);
    mechanics.freeGames = {...freeGames, awardsByCount: {...awardsByCount, [String(matchCount)]: awarded}};
    blueprint.mechanics = mechanics;
}

// Removes just this one matchCount entry -- if that was the last award, `awardsByCount` is left as an
// empty object (GameBlueprintValidator's own "blueprint-mechanics-freegames-empty-awards" already
// reports that as an error rather than this helper silently turning the whole mechanic off, the same
// division of responsibility removePaytablePayout/GameBlueprintValidator already follow for the
// paytable's own "empty payouts" case).
export function removeFreeGamesAward(blueprint: Record<string, unknown>, matchCount: number): void {
    const mechanics = asMechanics(blueprint.mechanics);
    const freeGames = asFreeGames(mechanics.freeGames);
    if (freeGames === undefined) {
        return;
    }
    const awardsByCount = {...asNumberRecord(freeGames.awardsByCount)};
    Reflect.deleteProperty(awardsByCount, String(matchCount));
    mechanics.freeGames = {...freeGames, awardsByCount};
    blueprint.mechanics = mechanics;
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

// A reel's own previously entered configuration for whichever "side" isn't currently active (a
// literal reel's last-known generated config, a generated reel's last-known literal strip, and a
// generated reel's last-known symbolCounts/symbolWeights for whichever of the two isn't active right
// now) -- kept entirely outside the authored blueprint (see setReelStripGenerationEntryType/
// setReelStripGenerationSourceMode below) so `blueprint`/`jsonText` and everything downstream of them
// (Validate, Preview, Save, Build) only ever see a clean, canonical GameBlueprint entry with no
// editor-only bookkeeping fields and no inactive leftovers -- restoring a draft is a Reel Strip
// Modeler UI nicety, never a property of the saved project. One Map, keyed by reelIndex, lives for the
// lifetime of the currently loaded blueprint in main.ts (see its own doc comment for why it's reset on
// New/Load).
export type ReelStripGenerationDraft = {
    generatedConfig?: Record<string, unknown>;
    literalStrip?: string[];
    inactiveSymbolCounts?: Record<string, number>;
    inactiveSymbolWeights?: Record<string, number>;
};
export type ReelStripGenerationDrafts = Map<number, ReelStripGenerationDraft>;

// Round-trips a reel's previously entered configuration for the type being *left*, instead of
// resetting it to defaults -- the type being left is stashed into `drafts` (never into the blueprint
// itself) and restored from there the next time its type becomes active again. A no-op if `type`
// already matches the reel's current type (so re-selecting the same radio never clobbers a
// since-edited entry with a stale draft).
export function setReelStripGenerationEntryType(
    blueprint: Record<string, unknown>,
    drafts: ReelStripGenerationDrafts,
    reelIndex: number,
    type: "literal" | "generated",
): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => {
        const currentType = entry.type === "generated" ? "generated" : "literal";
        if (currentType === type) {
            return entry;
        }

        const draft = drafts.get(reelIndex) ?? {};
        if (type === "literal") {
            const generatedConfig = {...entry};
            Reflect.deleteProperty(generatedConfig, "type");
            drafts.set(reelIndex, {...draft, generatedConfig});
            return {type: "literal", strip: draft.literalStrip ?? []};
        }

        drafts.set(reelIndex, {...draft, literalStrip: asStringArray(entry.strip)});
        if (draft.generatedConfig !== undefined) {
            return {type: "generated", ...draft.generatedConfig};
        }
        return {type: "generated", length: 1, seed: 1, symbolCounts: {}};
    });
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

// A sensible default "length" for a generated reel's own currently active symbolCounts/symbolWeights --
// the sum of whichever side is active. For counts, that's the length that already makes them sum
// exactly (no rounding needed). For weights, this mirrors buildRandomReelStripGeneration's own technique
// (length = sum of the weights themselves) so LargestRemainderReelStripSymbolWeightsConverter needs no
// rounding to hit those exact proportions. Returns undefined for an empty counts/weights table -- there
// is nothing to sum yet, so "Auto" has nothing sensible to set length to.
export function computeReelStripGenerationAutoLength(entry: Record<string, unknown>): number | undefined {
    const mode = getReelStripGenerationSourceMode(entry);
    const values = Object.values(asNumberRecord(mode === "symbolCounts" ? entry.symbolCounts : entry.symbolWeights));
    if (values.length === 0) {
        return undefined;
    }
    const sum = values.reduce((total, value) => total + value, 0);
    return mode === "symbolCounts" ? sum : Math.round(sum);
}

// Unlike the literal/generated "type" toggle above, symbolCounts and symbolWeights can't simply keep
// both riding along together while inactive: GameBlueprintValidator rejects a generated entry that has
// both (or neither) set -- "exactly one of these two must be set". So the side being *left* is stashed
// in `drafts` (never in the blueprint) instead of being deleted outright, and restored from there the
// next time its mode becomes active again -- switching Counts -> Weights -> Counts reproduces exactly
// what was entered under Counts, not a reset to {}. A no-op if `mode` already matches the reel's
// current source mode.
export function setReelStripGenerationSourceMode(
    blueprint: Record<string, unknown>,
    drafts: ReelStripGenerationDrafts,
    reelIndex: number,
    mode: ReelStripGenerationSourceMode,
): void {
    withReelStripGenerationEntry(blueprint, reelIndex, (entry) => {
        const currentMode = getReelStripGenerationSourceMode(entry);
        if (currentMode === mode) {
            return entry;
        }

        const draft = drafts.get(reelIndex) ?? {};
        const next = {...entry};
        if (mode === "symbolCounts") {
            if (entry.symbolWeights !== undefined) {
                drafts.set(reelIndex, {...draft, inactiveSymbolWeights: asNumberRecord(entry.symbolWeights)});
            }
            next.symbolCounts = draft.inactiveSymbolCounts ?? {};
            Reflect.deleteProperty(next, "symbolWeights");
        } else {
            if (entry.symbolCounts !== undefined) {
                drafts.set(reelIndex, {...draft, inactiveSymbolCounts: asNumberRecord(entry.symbolCounts)});
            }
            next.symbolWeights = draft.inactiveSymbolWeights ?? {};
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

// Commits a reel's fully-formed replacement entry wholesale, rather than patching one of its own fields
// like every mutator above -- the one primitive the Reel Strip Modeler's own explicit "Apply" action
// needs so editing a reel (its own local, not-yet-committed draft) never touches the shared blueprint
// until the user deliberately commits it. Reuses withReelStripGenerationEntry's own existing
// tolerant-of-a-missing-entry behavior rather than duplicating it.
export function applyReelStripGenerationEntry(blueprint: Record<string, unknown>, reelIndex: number, entry: Record<string, unknown>): void {
    withReelStripGenerationEntry(blueprint, reelIndex, () => entry);
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
