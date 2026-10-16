import type {GameBlueprint} from "../../generated/GameBlueprint.js";
import type {WeightedBonusState} from "../../session/videoslot/authored/WeightedBonus.js";
import type {PokieWasmFeatureSessionState} from "../PokieWasmRuntimeApi.js";

type Bounds = {lower: bigint; upper: bigint};
type NativeState = {base?: NativeState; executed?: number; remaining?: number; freeGamesNum?: number; chargedBetModeId?: string; bonus?: WeightedBonusState;
    sequenceState?: {context: string; contextRequested: boolean; implicitGeneration: number; selections: {reelIndex: number; variantId: string}[]; counts: Record<string, number>[]}};
const ceil = (value: bigint, divisor: bigint): bigint => (value + divisor - 1n) / divisor;
const within = (value: bigint, bounds: Bounds): boolean => value >= bounds.lower && value <= bounds.upper;

/** Model-sized strip analysis, never a Cartesian screen enumeration or a session replay.
 * Positive-weight alternatives alone can be drawn. Cascades/modifiers can break strip
 * adjacency, so their count envelope deliberately uses independent cells instead.
 */
function symbolBounds(model: GameBlueprint, symbol: string): {lower: number; upper: number} {
    const rows = model.screenGeometry?.evaluated.rows ?? model.rows;
    if (model.mechanics?.modifiers) return {lower: 0, upper: model.reels * rows};
    let lower = 0,
        upper = 0;
    for (let reel = 0; reel < model.reels; reel++) {
        const definition = model.reelSequences?.[reel];
        const strips = definition?.type === "weighted" ? definition.variants.filter(variant => variant.weight > 0).map(variant => variant.symbols)
            : [definition?.symbols ?? model.reelStrips![reel]];
        let minimum = rows,
            maximum = 0;
        for (const strip of strips) {
            if (model.mechanics?.cascade) {
                minimum = Math.min(minimum, strip.every(cell => cell === symbol) ? rows : 0);
                maximum = Math.max(maximum, strip.includes(symbol) ? rows : 0);
                continue;
            }
            let count = Array.from({length: rows}, (_, row) => strip[row % strip.length]).filter(cell => cell === symbol).length;
            for (let stop = 0; stop < strip.length; stop++) {
                minimum = Math.min(minimum, count);
                maximum = Math.max(maximum, count);
                count += Number(strip[(stop + rows) % strip.length] === symbol) - Number(strip[stop] === symbol);
            }
        }
        lower += minimum;
        upper += maximum;
    }
    return {lower, upper};
}

/** Portable-only feasibility authority. Call after native shape/model validation and
 * BEFORE fromSessionState. Accepted mathematics is bounded by the delivery sequence;
 * each completed entry occupies a model-derived interval, and the current entry owns
 * its retained elapsed continuation. No wallet, RNG, payout engine or observation copy
 * authorizes a counter. Work and memory depend on model size, never elapsed history.
 */
export function validateCheckpointFeasibility(model: GameBlueprint, checkpoint: PokieWasmFeatureSessionState): void {
    if (checkpoint.sequence === 0) return; // Constructor-owned initialization is checked separately.
    if (!model.mechanics?.weightedBonus && !model.reelSequences?.some(reel => reel.type === "weighted")) return;
    const invalid = (owner = model.mechanics?.weightedBonus ? "bonus" : "reel") => new Error(`Weighted ${owner} counters contradict accepted analytics accounting (model feasibility).`);
    const plays = checkpoint.feature.analytics?.position;
    const entry = checkpoint.feature.accounting?.entryPosition;
    if (!Number.isSafeInteger(plays) || plays! < 1 || plays! > checkpoint.sequence ||
        !Number.isSafeInteger(entry) || entry! < 1 || entry! > plays! ||
        !model.mechanics?.cascade && plays !== checkpoint.sequence) throw invalid();
    const p = BigInt(plays!),
        elapsed = p - BigInt(entry!);
    const stages = BigInt((model.mechanics?.cascade?.maxCascades ?? 0) + 1);
    if (BigInt(checkpoint.sequence) > p * stages || checkpoint.feature.logicalRound &&
        BigInt(checkpoint.feature.logicalRound.cursor - 1) !== elapsed) throw invalid();
    const layers: NativeState[] = [];
    let leaf = checkpoint.feature.state as NativeState;
    for (;;) {
        layers.push(leaf);
        if (!leaf.base) break;
        leaf = leaf.base;
    }
    const rules = model.mechanics;
    let minimumLength = 1n,
        maximumLength: bigint | undefined = 1n;
    const bounded = layers.find(layer => layer.executed !== undefined);
    if (rules?.weightedBonus) {
        const table = rules.weightedBonus;
        const trigger = symbolBounds(model, table.trigger.symbolId);
        const outcomes = table.outcomes.filter(outcome => outcome.weight > 0);
        maximumLength = BigInt(1 + (trigger.upper >= table.trigger.minimumCount ? Math.max(...outcomes.map(outcome => outcome.duration)) : 0));
        if (trigger.lower >= table.trigger.minimumCount) minimumLength = BigInt(1 + Math.min(...outcomes.map(outcome => outcome.duration)));
        if (BigInt(bounded!.executed!) !== elapsed) throw invalid("bonus");
    } else if (rules?.respins) {
        const trigger = symbolBounds(model, rules.respins.trigger.symbolId);
        const limit = rules.respins.retrigger === "none" ? rules.respins.grant : rules.respins.maxRespins;
        maximumLength = BigInt(1 + (trigger.upper >= rules.respins.trigger.minimumCount ? limit : 0));
        if (trigger.lower >= rules.respins.trigger.minimumCount) minimumLength = maximumLength;
        if (BigInt(bounded!.executed!) !== elapsed) throw invalid();
    } else if (rules?.freeGames) {
        const free = layers.find(layer => layer.freeGamesNum !== undefined)!;
        const mode = model.betModes?.find(mode => mode.id === layers.find(layer => layer.chargedBetModeId !== undefined)?.chargedBetModeId);
        const purchased = mode?.runtimeType === "buyFeature" && (mode.forcedFreeGames ?? 0) > 0;
        if (BigInt(Math.max(0, free.freeGamesNum! - Number(purchased))) !== elapsed) throw invalid();
        const scatter = symbolBounds(model, rules.freeGames.scatterSymbol);
        const retriggers = Object.entries(rules.freeGames.awardsByCount).some(([count, grant]) => grant > 0 && Number(count) >= scatter.lower && Number(count) <= scatter.upper);
        // Additive natural retriggers have no finite lifetime cap. Purchases without
        // natural grants consume their first free game on the charged entry itself.
        maximumLength = retriggers ? undefined : BigInt(Math.max(1, ...(model.betModes ?? []).map(mode => mode.runtimeType === "buyFeature" ? mode.forcedFreeGames ?? 0 : 1)));
    } else if (rules?.holdAndWin) {
        // Every reset locks at least one previously empty cell. Even the longest
        // possible completed feature therefore has a model-bounded lifetime.
        maximumLength = 1n + BigInt(model.reels) * BigInt(model.rows) * BigInt(rules.holdAndWin.initialRespins);
    }
    if (maximumLength !== undefined && elapsed >= maximumLength) throw invalid();
    // The current entry began at entryPosition. Partition its preceding plays into
    // completed entries, each occupying [minimumLength, maximumLength] plays.
    const prior = p - elapsed - 1n;
    const minimumEntries = maximumLength === undefined ? Number(prior > 0) + 1 : undefined;
    const entries: Bounds = {lower: minimumEntries === undefined ? ceil(prior, maximumLength!) + 1n : BigInt(minimumEntries),
        upper: prior / minimumLength + 1n};
    if (entries.lower > entries.upper) throw invalid();
    if (rules?.weightedBonus) {
        const table = rules.weightedBonus,
            bonus = bounded!.bonus!,
            remaining = BigInt(bounded!.remaining!);
        const selections = bonus.counts.reduce((sum, count) => sum + BigInt(count), 0n);
        const continuations = bonus.counts.reduce((sum, count, index) => sum + BigInt(count) * BigInt(table.outcomes[index].duration), 0n) - remaining;
        const acceptedEntries = p - continuations;
        const trigger = symbolBounds(model, table.trigger.symbolId);
        const selectionBounds: Bounds = {lower: trigger.lower >= table.trigger.minimumCount ? entries.lower : 0n,
            upper: trigger.upper < table.trigger.minimumCount ? 0n : entries.upper};
        if (trigger.lower >= table.trigger.minimumCount && !bonus.selection) throw new Error("Weighted bonus selection presence contradicts model-feasible paid entry.");
        const incomplete = remaining > 0 ? 1n : 0n;
        const completionBounds = {lower: selectionBounds.lower - incomplete, upper: selectionBounds.upper - incomplete};
        if (continuations < 0n || !within(acceptedEntries, entries) || !within(selections, selectionBounds) ||
            !within(BigInt(bonus.completed), completionBounds) || BigInt(bonus.completed) !== selections - incomplete ||
            selections > acceptedEntries || trigger.lower >= table.trigger.minimumCount && selections !== acceptedEntries) throw invalid("bonus");
        // Per-outcome durations conserve the exact reel-entry denominator even for
        // conditional triggers, zero-duration awards and mixed outcome durations.
        entries.lower = entries.upper = acceptedEntries;
    }
    const selection = leaf.sequenceState;
    if (!selection) return;
    if (selection.context === "initialization" || selection.contextRequested || selection.implicitGeneration > plays!) throw invalid();
    let total: bigint | undefined;
    for (const [reel, definition] of (model.reelSequences ?? []).entries()) {
        if (definition.type !== "weighted") continue;
        const counts = selection.counts[reel];
        const count = Object.values(counts).reduce((sum, value) => sum + BigInt(value), 0n);
        const selected = selection.selections.find(item => item.reelIndex === reel);
        if (!within(count, entries) || total !== undefined && count !== total || !selected || !(counts[selected.variantId] > 0)) throw invalid();
        total = count;
    }
}
