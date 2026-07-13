import type {ReelStripConstraint} from "../ReelStripConstraint.js";
import type {ReelStripConstraintViolation} from "../ReelStripConstraintViolation.js";
import type {ReelStripDefinition} from "../ReelStripDefinition.js";

// Requires specific positions to hold specific symbols — useful both for validating a hand-authored
// strip and, defensively, for re-checking a generated one (ReelStripGenerator's default strategy
// already honors locked positions by construction, but a custom strategy might not).
export class FixedPositionsConstraint implements ReelStripConstraint {
    private readonly lockedPositions: Record<number, string>;

    constructor(lockedPositions: Record<number, string>) {
        this.lockedPositions = {...lockedPositions};
    }

    public getId(): string {
        return "fixed-positions";
    }

    public validate(strip: ReelStripDefinition): ReelStripConstraintViolation[] {
        const violations: ReelStripConstraintViolation[] = [];
        for (const [positionKey, expectedSymbolId] of Object.entries(this.lockedPositions)) {
            const position = Number(positionKey);
            const actualSymbolId = strip.getSymbolAt(position);
            if (actualSymbolId !== expectedSymbolId) {
                violations.push({
                    constraintId: this.getId(),
                    message: `Position ${position} must hold "${expectedSymbolId}" but holds "${actualSymbolId}".`,
                    positions: [position],
                    details: {position, expectedSymbolId, actualSymbolId},
                });
            }
        }
        return violations;
    }
}
