// The cheap, upfront "how big is this?" a caller can compute before committing to a full exact enumeration —
// dry-run material: estimateExactOutcomeSpaceSize only reads reel-strip sizes (never enumerates, never runs a
// round), so it's safe to call even for a space far too large to ever fully enumerate.
export type OutcomeSpaceEstimate = {
    readonly reelsNumber: number;
    readonly reelsSymbolsNumber: number;
    readonly reelSizes: readonly number[]; // each reel's SymbolsSequence.getSize(), in reel order
    // Product of every reelSizes entry -- the raw (pre-dedup) count of distinct reel-stop tuples. This is an
    // upper bound on the library's own eventual outcome count, never the count itself: distinct reel-stop
    // tuples routinely render the same visible grid (see generateExactWeightedOutcomeLibrary's own dedup).
    readonly totalOutcomeSpaceSize: bigint;
};
