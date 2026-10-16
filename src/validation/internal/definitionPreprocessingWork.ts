import type {GameBlueprint} from "../../generated/GameBlueprint.js";

/** Conservative work bound, checked before validators, defaults or reel generation allocate. */
export function definitionPreprocessingWork(model: Partial<GameBlueprint>): number {
    const symbols = Array.isArray(model.symbols) ? model.symbols.length : 0;
    const reels = Number.isSafeInteger(model.reels) && model.reels! > 0 ? model.reels! : 1;
    const bets = Array.isArray(model.availableBets) ? model.availableBets.length : 11;
    const cells = reels * Math.max(model.rows ?? 0, model.screenGeometry?.generated?.rows ?? 0, model.screenGeometry?.evaluated?.rows ?? 0);
    let work = symbols ** 2 + symbols * reels * bets + cells;
    if (!model.reelSequences && !model.reelStrips) {
        if (Array.isArray(model.reelStripGeneration)) {
            for (const reel of model.reelStripGeneration) if (reel?.type === "generated") work += reel.length * (reel.maxAttempts ?? 200) * Math.max(1, (reel.constraints?.length ?? 0) + 1);
        } else work += reels * (model.symbolWeights ? Object.values(model.symbolWeights).reduce((sum, value) => sum + value, 0) : symbols * 1000);
    }
    return Number.isSafeInteger(work) && work >= 0 ? work : Infinity;
}
