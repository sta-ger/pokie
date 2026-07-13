import {assertPositiveFiniteInteger} from "../internal/assertPositiveFiniteInteger.js";
import {getCircularRuns} from "../internal/circularRuns.js";
import type {ReelStripConstraint} from "../ReelStripConstraint.js";
import type {ReelStripConstraintViolation} from "../ReelStripConstraintViolation.js";
import type {ReelStripDefinition} from "../ReelStripDefinition.js";

// Requires no run of identical adjacent symbols to exceed `maximumConsecutive`. Restrict to a
// subset of symbols via `symbolIds` (default: every symbol on the strip). Runs wrap around the
// strip's end by default (`wrapAround = true`); pass `false` to only check linear runs.
export class MaximumConsecutiveOccurrencesConstraint implements ReelStripConstraint {
    private readonly maximumConsecutive: number;
    private readonly symbolIds?: string[];
    private readonly wrapAround: boolean;

    constructor(maximumConsecutive: number, symbolIds?: string[], wrapAround = true) {
        assertPositiveFiniteInteger(maximumConsecutive, "maximumConsecutive");
        this.maximumConsecutive = maximumConsecutive;
        this.symbolIds = symbolIds ? [...symbolIds] : undefined;
        this.wrapAround = wrapAround;
    }

    public getId(): string {
        return "maximum-consecutive-occurrences";
    }

    public validate(strip: ReelStripDefinition): ReelStripConstraintViolation[] {
        const violations: ReelStripConstraintViolation[] = [];
        const allowedSymbolIds = this.symbolIds ? new Set(this.symbolIds) : undefined;

        for (const run of getCircularRuns(strip.toArray(), this.wrapAround)) {
            if (allowedSymbolIds && !allowedSymbolIds.has(run.symbolId)) {
                continue;
            }
            if (run.length > this.maximumConsecutive) {
                violations.push({
                    constraintId: this.getId(),
                    message: `Symbol "${run.symbolId}" repeats ${run.length} times in a row starting at position ${run.start}, exceeding the maximum of ${this.maximumConsecutive}.`,
                    positions: run.positions,
                    details: {symbolId: run.symbolId, runLength: run.length, maximumConsecutive: this.maximumConsecutive},
                });
            }
        }
        return violations;
    }
}
