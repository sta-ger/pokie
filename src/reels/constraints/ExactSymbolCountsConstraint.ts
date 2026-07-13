import type {ReelStripConstraint} from "../ReelStripConstraint.js";
import type {ReelStripConstraintViolation} from "../ReelStripConstraintViolation.js";
import type {ReelStripDefinition} from "../ReelStripDefinition.js";

// Flags any symbol whose actual occurrence count differs from the expected count, including
// symbols present on the strip but absent from `expectedCounts` (treated as expecting 0).
export class ExactSymbolCountsConstraint implements ReelStripConstraint {
    private readonly expectedCounts: Record<string, number>;

    constructor(expectedCounts: Record<string, number>) {
        this.expectedCounts = {...expectedCounts};
    }

    public getId(): string {
        return "exact-symbol-counts";
    }

    public validate(strip: ReelStripDefinition): ReelStripConstraintViolation[] {
        const violations: ReelStripConstraintViolation[] = [];
        const actualCounts = strip.getSymbolCounts();
        const symbolIds = new Set([...Object.keys(this.expectedCounts), ...Object.keys(actualCounts)]);

        for (const symbolId of symbolIds) {
            const expected = this.expectedCounts[symbolId] ?? 0;
            const actual = actualCounts[symbolId] ?? 0;
            if (expected !== actual) {
                violations.push({
                    constraintId: this.getId(),
                    message: `Symbol "${symbolId}" occurs ${actual} time(s), expected exactly ${expected}.`,
                    details: {symbolId, expected, actual},
                });
            }
        }
        return violations;
    }
}
