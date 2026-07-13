import type {ReelStripDefinition} from "./ReelStripDefinition.js";
import type {ReelStripConstraint} from "./ReelStripConstraint.js";
import type {ReelStripConstraintViolation} from "./ReelStripConstraintViolation.js";

export interface ReelStripConstraintValidator {
    validate(strip: ReelStripDefinition, constraints: ReelStripConstraint[]): ReelStripConstraintViolation[];
}
