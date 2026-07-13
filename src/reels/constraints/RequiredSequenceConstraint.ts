import {findSequenceOccurrences} from "../internal/findSequenceOccurrences.js";
import type {ReelStripConstraint} from "../ReelStripConstraint.js";
import type {ReelStripConstraintViolation} from "../ReelStripConstraintViolation.js";
import type {ReelStripDefinition} from "../ReelStripDefinition.js";

// Requires `sequence` (an exact, ordered run of symbol IDs) to occur, consecutively, at least
// `minimumOccurrences` and at most `maximumOccurrences` times. There's no separate symbolIds
// filter: `sequence` already determines exactly what's being searched for.
//
// `reversed = false` (default): only the sequence as given matches. `reversed = true`: its reverse
// also counts as a match (e.g. sequence ["A", "B", "C"] also matches "C", "B", "A" read backwards) --
// useful for symmetric patterns without declaring both directions separately.
//
// Matches wrap around the strip's end by default (`wrapAround = true`), matching a physical reel
// strip; pass `false` to only search linear (non-circular) windows. Overlapping matches all count
// independently (sequence ["A", "A"] against ["A", "A", "A"] matches at both position 0 and 1).
export class RequiredSequenceConstraint implements ReelStripConstraint {
    private readonly sequence: string[];
    private readonly minimumOccurrences: number;
    private readonly maximumOccurrences: number;
    private readonly reversed: boolean;
    private readonly wrapAround: boolean;

    constructor(sequence: string[], minimumOccurrences = 1, maximumOccurrences = Infinity, reversed = false, wrapAround = true) {
        if (sequence.length === 0) {
            throw new Error("sequence must contain at least one symbol.");
        }
        if (!Number.isInteger(minimumOccurrences) || minimumOccurrences < 0) {
            throw new Error(`minimumOccurrences must be a non-negative integer, got ${minimumOccurrences}.`);
        }
        if (maximumOccurrences !== Infinity && (!Number.isInteger(maximumOccurrences) || maximumOccurrences < 0)) {
            throw new Error(`maximumOccurrences must be a non-negative integer or Infinity, got ${maximumOccurrences}.`);
        }
        if (maximumOccurrences < minimumOccurrences) {
            throw new Error(`maximumOccurrences (${maximumOccurrences}) must be >= minimumOccurrences (${minimumOccurrences}).`);
        }

        this.sequence = [...sequence];
        this.minimumOccurrences = minimumOccurrences;
        this.maximumOccurrences = maximumOccurrences;
        this.reversed = reversed;
        this.wrapAround = wrapAround;
    }

    public getId(): string {
        return "required-sequence";
    }

    public validate(strip: ReelStripDefinition): ReelStripConstraintViolation[] {
        const violations: ReelStripConstraintViolation[] = [];
        const occurrences = findSequenceOccurrences(strip.toArray(), this.sequence, this.reversed, this.wrapAround);

        if (occurrences.length > this.maximumOccurrences) {
            const excessOccurrences = occurrences.length - this.maximumOccurrences;
            // Only the occurrences beyond the allowed maximum are themselves violations -- the
            // first `maximumOccurrences` matches are permitted and don't get a violation each.
            for (const occurrence of occurrences.slice(this.maximumOccurrences)) {
                violations.push({
                    constraintId: this.getId(),
                    message: `Sequence [${this.sequence.join(", ")}] occurs ${occurrences.length} time(s) (matched again at position ${occurrence.position}), exceeding the maximum of ${this.maximumOccurrences}.`,
                    positions: occurrence.positions,
                    details: {
                        sequence: [...this.sequence],
                        matched: occurrence.matched,
                        occurrencesFound: occurrences.length,
                        maximumOccurrences: this.maximumOccurrences,
                        excessOccurrences,
                    },
                });
            }
        }

        if (occurrences.length < this.minimumOccurrences) {
            violations.push({
                constraintId: this.getId(),
                message: `Sequence [${this.sequence.join(", ")}] occurs only ${occurrences.length} time(s), below the minimum of ${this.minimumOccurrences}.`,
                positions: occurrences.flatMap((occurrence) => occurrence.positions),
                details: {
                    sequence: [...this.sequence],
                    occurrencesFound: occurrences.length,
                    minimumOccurrences: this.minimumOccurrences,
                },
            });
        }

        return violations;
    }
}
