import {asStringList} from "./asStringList";

// A guided scatter + free-games starter must not invent a symbol id that already exists: symbols are
// foreign keys in the Blueprint. Prefer the conventional "S", then fall back to unused letters/numbers.
export function suggestScatterSymbolId(blueprint: Record<string, unknown>): string {
    const symbols = new Set(asStringList(blueprint.symbols));
    for (const candidate of ["S", "X", "Y", "Z"]) {
        if (!symbols.has(candidate)) return candidate;
    }
    let suffix = 2;
    while (symbols.has(`S${suffix}`)) suffix++;
    return `S${suffix}`;
}

// Three reels are the minimum needed for the 3/4/5-scatter award table. Spread them across the strip
// instead of always taking the first three, so the default placement does not look like an accident.
export function defaultScatterReels(reelCount: number): number[] {
    if (reelCount <= 0) return [];
    if (reelCount < 3) return Array.from({length: reelCount}, (_, index) => index);
    return [...new Set([0, Math.floor(reelCount / 2), reelCount - 1])];
}

export type ScatterFreeGamesPreview = {
    /** Probability of exactly k visible scatters, for every k from 0 to the reel count. */
    probabilities: number[];
    triggerProbability: number;
    expectedAward: number;
    retriggerFactor: number;
    /** Expected total free spins per trigger, including retriggers; undefined when the series diverges. */
    expectedFreeSpins: number | undefined;
};

/**
 * Exact probability preview for the wizard's proposed placement. It assumes one existing stop on each
 * selected reel is replaced by the new scatter, preserving the strip length (the same edit the wizard
 * applies), the visible window is `rows` stops high, and the strip wraps to its own start. That is exactly
 * the literal-strip model the subsequent validation and Exact math use, so the wizard can refuse a
 * supercritical starter before it writes one.
 */
export function previewScatterFreeGamesSetup({
    rows,
    reelStripLengths,
    selectedReels,
    awards,
}: {
    rows: number;
    reelStripLengths: readonly number[];
    selectedReels: readonly number[];
    awards: Readonly<Record<number, number>>;
}): ScatterFreeGamesPreview {
    const selected = new Set(selectedReels);
    let distribution = [1];
    for (let reel = 0; reel < reelStripLengths.length; reel++) {
        const stripLength = reelStripLengths[reel] ?? 0;
        const visible = Math.max(0, Math.min(rows, stripLength));
        const probability = selected.has(reel) && stripLength > 0 ? visible / stripLength : 0;
        const next = Array<number>(distribution.length + 1).fill(0);
        for (let count = 0; count < distribution.length; count++) {
            next[count] += distribution[count]! * (1 - probability);
            next[count + 1] += distribution[count]! * probability;
        }
        distribution = next;
    }
    const triggerProbability = distribution.reduce((sum, probability, count) => count >= 3 ? sum + probability : sum, 0);
    const weightedAward = distribution.reduce((sum, probability, count) => count >= 3 ? sum + probability * (awards[count] ?? 0) : sum, 0);
    const expectedAward = triggerProbability > 0 ? weightedAward / triggerProbability : 0;
    const retriggerFactor = triggerProbability * expectedAward;
    return {
        probabilities: distribution,
        triggerProbability,
        expectedAward,
        retriggerFactor,
        expectedFreeSpins: retriggerFactor < 1 ? expectedAward / (1 - retriggerFactor) : undefined,
    };
}
