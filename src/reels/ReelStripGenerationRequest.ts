import type {ReelStripConstraint} from "./ReelStripConstraint.js";
import type {ReelStripScorer} from "./ReelStripScorer.js";

export type ReelStripGenerationRequest = {
    length: number;
    symbolCounts: Record<string, number>;
    seed?: number;
    lockedPositions?: Record<number, string>;
    constraints?: ReelStripConstraint[];
    maxAttempts?: number;
    scorer?: ReelStripScorer;
};
