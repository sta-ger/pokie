export type SequenceOccurrence = {
    position: number;
    positions: number[];
    matched: string[];
};

// Finds every starting position at which `sequence` (or, if `reversed` is true, its reverse) reads
// off consecutively from `symbols`, an exact symbol-for-symbol match. Overlapping occurrences are
// all reported independently -- e.g. sequence ["A", "A"] against ["A", "A", "A"] matches at both
// position 0 and position 1. `wrapAround` controls whether a match may read across the strip's end
// back to its start; a sequence longer than the strip can never match, regardless of wrapAround.
export function findSequenceOccurrences(symbols: string[], sequence: string[], reversed: boolean, wrapAround: boolean): SequenceOccurrence[] {
    const length = symbols.length;
    const sequenceLength = sequence.length;
    if (sequenceLength === 0 || sequenceLength > length) {
        return [];
    }

    const reversedSequence = reversed ? [...sequence].reverse() : undefined;
    const lastStart = wrapAround ? length - 1 : length - sequenceLength;
    const occurrences: SequenceOccurrence[] = [];

    for (let start = 0; start <= lastStart; start++) {
        const positions: number[] = [];
        const window: string[] = [];
        for (let offset = 0; offset < sequenceLength; offset++) {
            const position = (start + offset) % length;
            positions.push(position);
            window.push(symbols[position]);
        }
        if (arraysEqual(window, sequence) || (reversedSequence !== undefined && arraysEqual(window, reversedSequence))) {
            occurrences.push({position: start, positions, matched: window});
        }
    }
    return occurrences;
}

function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}
