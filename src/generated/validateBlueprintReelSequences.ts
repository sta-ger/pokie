import {WeightedSymbolsSequence} from "../session/videoslot/combinations/WeightedSymbolsSequence.js";
import type {WeightedSequenceVariant} from "../session/videoslot/combinations/WeightedSequenceVariant.js";

/** Shared JSON/direct definition validation. Diagnostics retain authored reel/variant paths. */
export function validateBlueprintReelSequences(blueprint: Record<string, unknown>): string[] {
    const source = blueprint.reelSequences;
    if (source === undefined) return [];
    const errors: string[] = [];
    if (["reelStrips", "reelStripGeneration", "symbolWeights"].some(key => blueprint[key] !== undefined)) errors.push("reelSequences: exactly one reel source is allowed; remove reelStrips, reelStripGeneration and symbolWeights.");
    if (!Array.isArray(source) || source.length !== blueprint.reels || source.length === 0) return [...errors, "reelSequences: expected exactly one definition per reel."];
    Array.from(source).forEach((entry, index) => {
        const path = `reelSequences[${index}]`;
        const value = entry as {type?: unknown; symbols?: unknown; variants?: unknown};
        try {
            if (!value || typeof value !== "object") throw new Error(`${path}: expected exact or weighted definition.`);
            if (value.type === "weighted") {
                if (value.symbols !== undefined) throw new Error(`${path}: ambiguous exact and weighted definition.`);
                new WeightedSymbolsSequence(value.variants as WeightedSequenceVariant[], blueprint.symbols as string[], `${path}.variants`).getSize();
            } else if (value.type === "exact") {
                if (value.variants !== undefined || !Array.isArray(value.symbols) || value.symbols.length === 0 || Array.from(value.symbols).some(symbol => typeof symbol !== "string" || !Array.isArray(blueprint.symbols) || !blueprint.symbols.includes(symbol))) throw new Error(`${path}.symbols: expected a nonempty exact array of known symbols without variants.`);
            } else throw new Error(`${path}.type: expected exact or weighted.`);
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
    });
    return errors;
}
