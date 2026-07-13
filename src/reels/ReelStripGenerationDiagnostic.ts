import type {ReelStripConstraintViolation} from "./ReelStripConstraintViolation.js";

export type ReelStripGenerationDiagnostic = {
    attempt: number;
    accepted: boolean;
    violations: ReelStripConstraintViolation[];
    score?: number;
};
