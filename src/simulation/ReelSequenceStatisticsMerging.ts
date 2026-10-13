import type {ReelSequenceStatistics} from "../session/videoslot/combinations/WeightedSequenceVariant.js";

export function mergeReelSequenceStatistics(first: readonly ReelSequenceStatistics[] = [], second: readonly ReelSequenceStatistics[] = [], subtract = false): ReelSequenceStatistics[] {
    const reels = new Map(first.map(reel => [reel.reelIndex, reel]));
    for (const reel of second) {
        const prior = reels.get(reel.reelIndex);
        if (prior && (prior.model !== reel.model || prior.context !== reel.context || JSON.stringify(prior.variants.map(({id, weight, probability}) => ({id, weight, probability}))) !== JSON.stringify(reel.variants.map(({id, weight, probability}) => ({id, weight, probability}))))) throw new Error("Cannot merge incompatible weighted reel models.");
        const selections = (prior?.selections ?? 0) + (subtract ? -reel.selections : reel.selections);
        if (!Number.isSafeInteger(selections) || selections < 0) throw new Error("Invalid weighted selection denominator.");
        const variants = reel.variants.map(variant => {
            const count = (prior?.variants.find(item => item.id === variant.id)?.count ?? 0) + (subtract ? -variant.count : variant.count);
            if (!Number.isSafeInteger(count) || count < 0 || count > selections || (variant.weight === 0 && count !== 0)) throw new Error("Invalid weighted selection count.");
            return {...variant, count, frequency: selections ? count / selections : 0, uncovered: variant.weight > 0 && count === 0};
        });
        if (variants.reduce((sum, variant) => sum + variant.count, 0) !== selections) throw new Error("Variant counts differ from selection denominator.");
        reels.set(reel.reelIndex, {...reel, selections, variants});
    }
    return [...reels.values()].sort((a, b) => a.reelIndex - b.reelIndex);
}
