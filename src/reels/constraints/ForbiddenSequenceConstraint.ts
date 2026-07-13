import {findSequenceOccurrences} from "../internal/findSequenceOccurrences.js";
import type {ReelStripConstraint} from "../ReelStripConstraint.js";
import type {ReelStripConstraintViolation} from "../ReelStripConstraintViolation.js";
import type {ReelStripDefinition} from "../ReelStripDefinition.js";

// Requires `sequence` (an exact, ordered run of symbol IDs) to occur, consecutively, at most
// `maximumOccurrences` times -- by default 0, i.e. fully forbidden; pass a higher value to allow a
// restricted number of occurrences instead of banning the pattern outright. The mirror image of
// RequiredSequenceConstraint. There's no separate symbolIds filter: `sequence` already determines
// exactly what's being searched for.
//
// `reversed = false` (default): only the sequence as given is checked. `reversed = true`: its
// reverse is forbidden too (e.g. sequence ["A", "B", "C"] also forbids "C", "B", "A" read
// backwards).
//
// Matches wrap around the strip's end by default (`wrapAround = true`), matching a physical reel
// strip; pass `false` to only search linear (non-circular) windows. Overlapping matches all count
// independently and are each reported as their own violation.
export class ForbiddenSequenceConstraint implements ReelStripConstraint {
    private readonly sequence: string[];
    private readonly maximumOccurrences: number;
    private readonly reversed: boolean;
    private readonly wrapAround: boolean;

    constructor(sequence: string[], maximumOccurrences = 0, reversed = false, wrapAround = true) {
        if (sequence.length === 0) {
            throw new Error("sequence must contain at least one symbol.");
        }
        if (!Number.isInteger(maximumOccurrences) || maximumOccurrences < 0) {
            throw new Error(`maximumOccurrences must be a non-negative integer, got ${maximumOccurrences}.`);
        }

        this.sequence = [...sequence];
        this.maximumOccurrences = maximumOccurrences;
        this.reversed = reversed;
        this.wrapAround = wrapAround;
    }

    public getId(): string {
        return "forbidden-sequence";
    }

    public validate(strip: ReelStripDefinition): ReelStripConstraintViolation[] {
        const occurrences = findSequenceOccurrences(strip.toArray(), this.sequence, this.reversed, this.wrapAround);
        if (occurrences.length <= this.maximumOccurrences) {
            return [];
        }

        return occurrences.map((occurrence) => ({
            constraintId: this.getId(),
            message: `Forbidden sequence [${this.sequence.join(", ")}] found at position ${occurrence.position} (${occurrences.length} occurrence(s) total, maximum allowed is ${this.maximumOccurrences}).`,
            positions: occurrence.positions,
            details: {
                sequence: [...this.sequence],
                matched: occurrence.matched,
                occurrencesFound: occurrences.length,
                maximumOccurrences: this.maximumOccurrences,
            },
        }));
    }
}
