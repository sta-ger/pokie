import type {ReelSequenceSelection} from "../session/videoslot/combinations/WeightedSequenceVariant.js";

export function validateSequenceSelections(value: unknown, reels: number, roundId?: string): void {
    if (value === undefined) return;
    if (!Array.isArray(value) || value.length === 0) throw new Error("Invalid sequence selections.");
    const seen = new Set<number>();
    for (const item of value as ReelSequenceSelection[]) {
        if (!item || !Number.isSafeInteger(item.reelIndex) || item.reelIndex < 0 || item.reelIndex >= reels || seen.has(item.reelIndex) || typeof item.variantId !== "string" || !item.variantId.trim() || typeof item.context !== "string" || !(/^(implicit:[1-9][0-9]*|logical:[\s\S]+)$/).test(item.context) || (roundId !== undefined && item.context.startsWith("logical:") && item.context !== `logical:${roundId}`)) throw new Error("Invalid reel variant ID or selection context.");
        seen.add(item.reelIndex);
    }
}
