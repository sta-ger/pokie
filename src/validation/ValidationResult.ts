import {ValidationIssue, ValidationIssueSeverity} from "pokie";

export class ValidationResult {
    private readonly issues: ValidationIssue[];

    constructor(issues: ValidationIssue[] = []) {
        this.issues = issues.map((issue) => ({...issue, details: issue.details ? {...issue.details} : undefined}));
    }

    public getIssues(): ValidationIssue[] {
        return this.issues.map((issue) => ({...issue, details: issue.details ? {...issue.details} : undefined}));
    }

    public hasErrors(): boolean {
        return this.hasSeverity("error");
    }

    public hasWarnings(): boolean {
        return this.hasSeverity("warning");
    }

    public hasSeverity(severity: ValidationIssueSeverity): boolean {
        return this.issues.some((issue) => issue.severity === severity);
    }
}
