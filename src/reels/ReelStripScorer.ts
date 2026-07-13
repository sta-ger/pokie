import type {ReelStripDefinition} from "./ReelStripDefinition.js";
import type {ReelStripConstraintViolation} from "./ReelStripConstraintViolation.js";

export interface ReelStripScorer {
    score(strip: ReelStripDefinition, violations: ReelStripConstraintViolation[]): number;
}
