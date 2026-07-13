import {assertPositiveFiniteInteger} from "../internal/assertPositiveFiniteInteger.js";
import {getCircularGaps} from "../internal/circularGaps.js";
import type {ReelStripConstraint} from "../ReelStripConstraint.js";
import type {ReelStripConstraintViolation} from "../ReelStripConstraintViolation.js";
import type {ReelStripDefinition} from "../ReelStripDefinition.js";

// Requires that no gap between one occurrence of a symbol and the *next* occurrence of that same
// symbol -- going around the circular strip -- is below `minimumDistance`. This checks consecutive
// occurrences only (the arcs that partition the circle between them); for a minimum, that is
// equivalent to checking every pair (the closest pair of occurrences is always a consecutive one).
// Restrict to a subset of symbols via `symbolIds` (default: every symbol on the strip). Arcs wrap
// around the strip's end by default (`wrapAround = true`), matching a physical reel strip; pass
// `false` to check only the linear (non-circular) arcs between occurrences.
export class MinimumCircularDistanceConstraint implements ReelStripConstraint {
    private readonly minimumDistance: number;
    private readonly symbolIds?: string[];
    private readonly wrapAround: boolean;

    constructor(minimumDistance: number, symbolIds?: string[], wrapAround = true) {
        assertPositiveFiniteInteger(minimumDistance, "minimumDistance");
        this.minimumDistance = minimumDistance;
        this.symbolIds = symbolIds ? [...symbolIds] : undefined;
        this.wrapAround = wrapAround;
    }

    public getId(): string {
        return "minimum-circular-distance";
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
                if (gap.gap < this.minimumDistance) {
                    violations.push({
                        constraintId: this.getId(),
                        message: `Symbol "${symbolId}" at positions ${gap.from} and ${gap.to} are ${gap.gap} apart, below the minimum distance of ${this.minimumDistance}.`,
                        positions: [gap.from, gap.to],
                        details: {symbolId, gap: gap.gap, minimumDistance: this.minimumDistance},
                    });
                }
            }
        }
        return violations;
    }
}
