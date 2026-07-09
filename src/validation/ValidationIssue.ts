import type {ValidationIssueSeverity} from "./ValidationIssueSeverity.js";

export type ValidationIssue = {
    code: string;
    severity: ValidationIssueSeverity;
    message: string;
    details?: Record<string, unknown>;
    suggestion?: string;
};
