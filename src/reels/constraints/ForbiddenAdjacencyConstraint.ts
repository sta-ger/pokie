import type {ReelStripConstraint} from "../ReelStripConstraint.js";
import type {ReelStripConstraintViolation} from "../ReelStripConstraintViolation.js";
import type {ReelStripDefinition} from "../ReelStripDefinition.js";

// Requires that no adjacent pair of positions holds two symbols from the same forbidden pair (order
// doesn't matter — [A, B] also forbids B next to A). Adjacency wraps around the strip's end by
// default (`wrapAround = true`); pass `false` to only check linear adjacency.
export class ForbiddenAdjacencyConstraint implements ReelStripConstraint {
    private readonly forbiddenPairs: ReadonlySet<string>;
    private readonly wrapAround: boolean;

    constructor(forbiddenPairs: [string, string][], wrapAround = true) {
        this.forbiddenPairs = new Set(forbiddenPairs.map(([first, second]) => ForbiddenAdjacencyConstraint.toKey(first, second)));
        this.wrapAround = wrapAround;
    }

    // JSON-encoded rather than joined with a plain separator: symbol IDs containing that separator
    // (e.g. "A,B" and "C" vs. "A" and "B,C") would otherwise collide onto the same key.
    private static toKey(first: string, second: string): string {
        return JSON.stringify([first, second].sort());
    }

    public getId(): string {
        return "forbidden-adjacency";
    }

    public validate(strip: ReelStripDefinition): ReelStripConstraintViolation[] {
        const violations: ReelStripConstraintViolation[] = [];
        const length = strip.getLength();
        const symbols = strip.toArray();
        const adjacentPairsCount = this.wrapAround ? length : length - 1;

        for (let position = 0; position < adjacentPairsCount; position++) {
            const nextPosition = (position + 1) % length;
            const key = ForbiddenAdjacencyConstraint.toKey(symbols[position], symbols[nextPosition]);
            if (this.forbiddenPairs.has(key)) {
                violations.push({
                    constraintId: this.getId(),
                    message: `Forbidden adjacency: "${symbols[position]}" next to "${symbols[nextPosition]}" at positions ${position} and ${nextPosition}.`,
                    positions: [position, nextPosition],
                    details: {first: symbols[position], second: symbols[nextPosition]},
                });
            }
        }
        return violations;
    }
}
