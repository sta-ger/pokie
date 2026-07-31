// Exhaustively enumerates every reel-stop tuple (one 0-based position per reel) in the exact same odometer
// order SymbolsCombinationsAnalyzer.getAllPossibleSymbolsCombinations already uses -- the last reel varies
// fastest -- except streamed one tuple at a time (bounded memory: this never materializes the
// reelSizes-product-sized array that method does) and resumable from an arbitrary "rawIndex" via mixed-radix
// decomposition, so a cancelled sweep can restart past its own last-processed tuple instead of from zero.
export function *sweepStopTuples(reelSizes: readonly number[], startIndex: bigint): Generator<{tuple: number[]; rawIndex: bigint}> {
    const totalOutcomeSpaceSize = reelSizes.reduce((total, size) => total * BigInt(size), BigInt(1));
    if (startIndex < BigInt(0) || startIndex > totalOutcomeSpaceSize) {
        throw new RangeError(`startIndex ${startIndex} is out of range for an outcome space of size ${totalOutcomeSpaceSize}.`);
    }

    const stopPositions: number[] = new Array(reelSizes.length).fill(0);
    let remainder = startIndex;
    for (let reelId = reelSizes.length - 1; reelId >= 0; reelId--) {
        const size = BigInt(reelSizes[reelId]);
        stopPositions[reelId] = size === BigInt(0) ? 0 : Number(remainder % size);
        remainder = remainder / size;
    }

    let rawIndex = startIndex;
    while (rawIndex < totalOutcomeSpaceSize) {
        yield {tuple: [...stopPositions], rawIndex};

        let reelId = stopPositions.length - 1;
        while (reelId >= 0 && ++stopPositions[reelId] === reelSizes[reelId]) {
            stopPositions[reelId] = 0;
            reelId--;
        }
        rawIndex++;
    }
}
