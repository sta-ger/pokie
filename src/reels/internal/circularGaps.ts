export type CircularGap = {
    from: number;
    to: number;
    gap: number;
};

// Computes the gap between every pair of consecutive positions (already sorted ascending) around a
// circular sequence of the given `length`. When `wrapAround` is true (the default), the pair formed
// by the last and first position also produces a gap that crosses the wrap point.
export function getCircularGaps(positions: number[], length: number, wrapAround = true): CircularGap[] {
    if (positions.length < 2) {
        return [];
    }

    const gaps: CircularGap[] = [];
    for (let i = 0; i < positions.length; i++) {
        const isLastPair = i === positions.length - 1;
        if (isLastPair && !wrapAround) {
            continue;
        }
        const current = positions[i];
        const next = positions[(i + 1) % positions.length];
        const gap = isLastPair ? length - current + next : next - current;
        gaps.push({from: current, to: next, gap});
    }
    return gaps;
}
