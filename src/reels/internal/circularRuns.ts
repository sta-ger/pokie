export type CircularRun = {
    symbolId: string;
    start: number;
    length: number;
    positions: number[];
};

// Finds every maximal run of identical adjacent symbols in `symbols`. When `wrapAround` is true
// (the default, matching a physical reel strip), the sequence's last and first symbols are treated
// as adjacent, so a run can straddle the wrap point; a sequence where every symbol is identical
// collapses to a single run spanning the whole length either way.
export function getCircularRuns(symbols: string[], wrapAround = true): CircularRun[] {
    const length = symbols.length;
    if (length === 0) {
        return [];
    }
    if (symbols.every((symbolId) => symbolId === symbols[0])) {
        return [{symbolId: symbols[0], start: 0, length, positions: symbols.map((_, index) => index)}];
    }

    const startIndex = wrapAround ? findRunBoundary(symbols, length) : 0;
    const runs: CircularRun[] = [];
    let index = 0;
    while (index < length) {
        const position = (startIndex + index) % length;
        const symbolId = symbols[position];
        const positions: number[] = [position];
        let runLength = 1;
        while (index + runLength < length && symbols[(startIndex + index + runLength) % length] === symbolId) {
            positions.push((startIndex + index + runLength) % length);
            runLength++;
        }
        runs.push({symbolId, start: position, length: runLength, positions});
        index += runLength;
    }
    return runs;
}

function findRunBoundary(symbols: string[], length: number): number {
    for (let i = 0; i < length; i++) {
        const previous = symbols[(i - 1 + length) % length];
        if (symbols[i] !== previous) {
            return i;
        }
    }
    return 0;
}
