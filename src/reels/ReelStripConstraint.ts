import type {ReelStripDefinition} from "./ReelStripDefinition.js";
import type {ReelStripConstraintViolation} from "./ReelStripConstraintViolation.js";

export interface ReelStripConstraint {
    getId(): string;
    validate(strip: ReelStripDefinition): ReelStripConstraintViolation[];
}
