import type {ReelStripDefinition} from "./ReelStripDefinition.js";
import type {ReelStripConstraintViolation} from "./ReelStripConstraintViolation.js";
import type {ReelStripScorer} from "./ReelStripScorer.js";

// Default ReelStripScorer: higher is better, 0 (no violations) is the best possible score — a
// candidate with any violation always scores lower than one without, regardless of how many.
export class ViolationCountReelStripScorer implements ReelStripScorer {
    public score(strip: ReelStripDefinition, violations: ReelStripConstraintViolation[]): number {
        return -violations.length;
    }
}
