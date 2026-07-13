import type {ReelStripDefinition} from "./ReelStripDefinition.js";
import type {ReelStripConstraint} from "./ReelStripConstraint.js";
import type {ReelStripConstraintValidator} from "./ReelStripConstraintValidator.js";
import type {ReelStripConstraintViolation} from "./ReelStripConstraintViolation.js";

// Default ReelStripConstraintValidator: runs every constraint independently over the same strip and
// concatenates their violations — constraints never see each other, so adding a new constraint type
// never requires touching this class (Open/Closed).
export class CompositeReelStripConstraintValidator implements ReelStripConstraintValidator {
    public validate(strip: ReelStripDefinition, constraints: ReelStripConstraint[]): ReelStripConstraintViolation[] {
        const violations: ReelStripConstraintViolation[] = [];
        for (const constraint of constraints) {
            violations.push(...constraint.validate(strip));
        }
        return violations;
    }
}
