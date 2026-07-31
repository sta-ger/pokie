import type {WeightedOutcomeRandomSource} from "../../../pregenerated/WeightedOutcomeRandomSource.js";

// The bounded/coverage counterpart to sweepStopTuples: draws "sampleSize" independent reel-stop tuples
// (with replacement, standard Monte Carlo sampling -- the same population sweepStopTuples would sweep
// exhaustively for a small enough space) via a caller-supplied WeightedOutcomeRandomSource, one per-reel
// nextInt() draw at a time. Never needs a draw over the (potentially far-larger-than-2^53) full space size
// as a single number -- exactly why this is the strategy that still works once a space is too large to sweep.
export function *sampleStopTuples(reelSizes: readonly number[], sampleSize: bigint, randomSource: WeightedOutcomeRandomSource): Generator<{tuple: number[]; rawIndex: bigint}> {
    for (let rawIndex = BigInt(0); rawIndex < sampleSize; rawIndex++) {
        yield {tuple: reelSizes.map((size) => randomSource.nextInt(size)), rawIndex};
    }
}
