import {getCircularGaps} from "../internal/circularGaps.js";
import type {ReelStripConstraint} from "../ReelStripConstraint.js";
import type {ReelStripConstraintViolation} from "../ReelStripConstraintViolation.js";
import type {ReelStripDefinition} from "../ReelStripDefinition.js";

// Requires every pair of occurrences of the same symbol to be at most `maximumDistance` apart --
// the mirror image of MinimumCircularDistanceConstraint, useful for a symbol that must not go too
// long without reappearing (e.g. a scatter that should hit reasonably often). Restrict to a subset
// of symbols via `symbolIds` (default: every symbol on the strip). Distances wrap around the
// strip's end by default (`wrapAround = true`), matching a physical reel strip; pass `false` to
// check only the linear (non-circular) gaps between occurrences. A symbol occurring 0 or 1 times
// has no gap to measure and is never flagged by this constraint.
export class MaximumCircularDistanceConstraint implements ReelStripConstraint {
    private readonly maximumDistance: number;
    private readonly symbolIds?: string[];
    private readonly wrapAround: boolean;

    constructor(maximumDistance: number, symbolIds?: string[], wrapAround = true) {
        this.maximumDistance = maximumDistance;
        this.symbolIds = symbolIds ? [...symbolIds] : undefined;
        this.wrapAround = wrapAround;
    }

    public getId(): string {
        return "maximum-circular-distance";
    }

    public validate(strip: ReelStripDefinition): ReelStripConstraintViolation[] {
        const violations: ReelStripConstraintViolation[] = [];
        const length = strip.getLength();
        const symbols = strip.toArray();
        const targetSymbolIds = this.symbolIds ?? Object.keys(strip.getSymbolCounts());

        for (const symbolId of targetSymbolIds) {
            const positions: number[] = [];
            symbols.forEach((symbol, index) => {
                if (symbol === symbolId) {
                    positions.push(index);
                }
            });

            for (const gap of getCircularGaps(positions, length, this.wrapAround)) {
                if (gap.gap > this.maximumDistance) {
                    violations.push({
                        constraintId: this.getId(),
                        message: `Symbol "${symbolId}" at positions ${gap.from} and ${gap.to} are ${gap.gap} apart, exceeding the maximum distance of ${this.maximumDistance}.`,
                        positions: [gap.from, gap.to],
                        details: {symbolId, gap: gap.gap, maximumDistance: this.maximumDistance},
                    });
                }
            }
        }
        return violations;
    }
}
