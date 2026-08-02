import type {ReelStripGenerationSpec} from "pokie";

// Converts a random blueprint's flat symbolWeights ratio into a per-reel reelStripGeneration array --
// one independent "generated" entry per reel, each targeting the exact same symbol:weight ratio (so
// every quality check GameBlueprintValidator runs over the resulting weighting -- dominant symbol,
// wild-too-common, pay-mismatch -- sees the same proportions a flat symbolWeights blueprint would have
// produced, just replicated once per reel; see buildRandomReelStripGeneration.test.ts) -- rather than
// the single implicit engine-wide weighting a bare "symbolWeights" field leaves for the runtime to
// apply. "length" is the sum of the weights themselves, so LargestRemainderReelStripSymbolWeightsConverter
// (inside ReelStripGenerator.generateFromSymbolWeights, which resolveReelStripGeneration/
// GamePackageGenerator both already run this through) needs no rounding to hit those exact counts.
// "seed" is offset per reel (reelIndex added to the base seed) so each reel's own shuffle is
// independent -- reproducible from the same base seed every time, per reelStripGeneration's own
// "seed is required, must stay deterministic" contract.
export function buildRandomReelStripGeneration(symbolWeights: Record<string, number>, reels: number, seed: number): ReelStripGenerationSpec[] {
    const length = Object.values(symbolWeights).reduce((sum, weight) => sum + weight, 0);
    return Array.from({length: reels}, (_, reelIndex) => ({
        type: "generated" as const,
        length,
        symbolWeights,
        seed: seed + reelIndex,
    }));
}
