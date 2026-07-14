import {RoundArtifactValidator} from "../artifact/RoundArtifactValidator.js";
import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ValidationRule} from "../validation/ValidationRule.js";
import {PRE_GENERATED_ROUND_RESULT_SCHEMA_VERSION, type PreGeneratedRoundResult} from "./PreGeneratedRoundResult.js";

// A PreGeneratedRoundResult's own static type guarantees nothing about a value that actually arrives at
// runtime (e.g. one round-tripped through JSON.parse) — see RoundArtifactValidator's own doc comment
// for why every field here is read through this loosened view instead.
type Loose<X> = {[K in keyof X]?: unknown};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

// Structural invariants a PreGeneratedRoundResult must satisfy regardless of how it was built or where
// it came from — reuses the existing generic ValidationRule<T> contract, same as
// RoundArtifactValidator/WeightedOutcomeLibraryValidator. Delegates full validation of `artifact` to a
// real RoundArtifactValidator, so "artifact validity" here is exactly RoundArtifactValidator's own
// definition, not a second one. Never throws: every check is defensive about the actual runtime shape
// of its input, and the top-level validate() wraps everything in a catch-all so a genuinely malformed
// result still comes back as a ValidationIssue, not an exception.
export class PreGeneratedRoundResultValidator<T extends string | number = string>
implements ValidationRule<PreGeneratedRoundResult<T>> {
    private readonly roundArtifactValidator = new RoundArtifactValidator<T>();

    public validate(result: PreGeneratedRoundResult<T>): ValidationIssue[] {
        try {
            return this.validateInternal(result);
        } catch (error) {
            return [
                {
                    code: "pre-generated-round-malformed",
                    severity: "error",
                    message: `PreGeneratedRoundResult could not be validated: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }
    }

    private validateInternal(result: PreGeneratedRoundResult<T>): ValidationIssue[] {
        const r = result as unknown as Loose<PreGeneratedRoundResult<T>>;
        const issues: ValidationIssue[] = [];

        this.validateSchemaVersion(r, issues);
        this.validateSelection(r.selection as Loose<PreGeneratedRoundResult<T>["selection"]> | undefined, issues);
        this.validateRuntime(r.runtime as Loose<PreGeneratedRoundResult<T>["runtime"]> | undefined, issues);

        if (typeof r.artifact !== "object" || r.artifact === null) {
            issues.push({code: "pre-generated-round-artifact-invalid", severity: "error", message: "artifact must be an object."});
        } else {
            this.roundArtifactValidator.validate(r.artifact as PreGeneratedRoundResult<T>["artifact"]).forEach((issue) => issues.push(issue));
        }

        this.validateJsonSafety(result, issues);

        return issues;
    }

    private validateSchemaVersion(r: Loose<PreGeneratedRoundResult<T>>, issues: ValidationIssue[]): void {
        if (typeof r.schemaVersion !== "number" || !Number.isInteger(r.schemaVersion) || r.schemaVersion < 1) {
            issues.push({
                code: "pre-generated-round-schema-version-invalid",
                severity: "error",
                message: `schemaVersion must be a positive integer, got ${String(r.schemaVersion)}.`,
            });
            return;
        }
        if (r.schemaVersion !== PRE_GENERATED_ROUND_RESULT_SCHEMA_VERSION) {
            issues.push({
                code: "pre-generated-round-schema-version-unsupported",
                severity: "error",
                message: `schemaVersion ${r.schemaVersion} is not supported (expected ${PRE_GENERATED_ROUND_RESULT_SCHEMA_VERSION}).`,
            });
        }
    }

    private validateSelection(
        selection: Loose<PreGeneratedRoundResult<T>["selection"]> | undefined,
        issues: ValidationIssue[],
    ): void {
        if (typeof selection !== "object" || selection === null) {
            issues.push({code: "pre-generated-round-selection-invalid", severity: "error", message: "selection must be an object."});
            return;
        }
        if (!isNonEmptyString(selection.libraryId)) {
            issues.push({
                code: "pre-generated-round-selection-library-id-invalid",
                severity: "error",
                message: "selection.libraryId must be a non-empty string.",
            });
        }
        if (!isNonEmptyString(selection.libraryHash)) {
            issues.push({
                code: "pre-generated-round-selection-library-hash-invalid",
                severity: "error",
                message: "selection.libraryHash must be a non-empty string.",
            });
        }
        if (!isNonEmptyString(selection.outcomeId)) {
            issues.push({
                code: "pre-generated-round-selection-outcome-id-invalid",
                severity: "error",
                message: "selection.outcomeId must be a non-empty string.",
            });
        }
        if (!isFiniteNumber(selection.weight) || selection.weight <= 0) {
            issues.push({
                code: "pre-generated-round-selection-weight-invalid",
                severity: "error",
                message: `selection.weight must be a finite number > 0, got ${String(selection.weight)}.`,
            });
        }
        if (!isFiniteNumber(selection.totalWeight) || selection.totalWeight <= 0) {
            issues.push({
                code: "pre-generated-round-selection-total-weight-invalid",
                severity: "error",
                message: `selection.totalWeight must be a finite number > 0, got ${String(selection.totalWeight)}.`,
            });
        }
        if (!isFiniteNumber(selection.probability) || selection.probability <= 0 || selection.probability > 1) {
            issues.push({
                code: "pre-generated-round-selection-probability-invalid",
                severity: "error",
                message: `selection.probability must be a finite number in (0, 1], got ${String(selection.probability)}.`,
            });
        }
    }

    private validateRuntime(runtime: Loose<PreGeneratedRoundResult<T>["runtime"]> | undefined, issues: ValidationIssue[]): void {
        if (typeof runtime !== "object" || runtime === null) {
            issues.push({code: "pre-generated-round-runtime-invalid", severity: "error", message: "runtime must be an object."});
            return;
        }
        if (!isNonEmptyString(runtime.roundId)) {
            issues.push({code: "pre-generated-round-round-id-invalid", severity: "error", message: "runtime.roundId must be a non-empty string."});
        }
        if (!isNonEmptyString(runtime.sessionId)) {
            issues.push({
                code: "pre-generated-round-session-id-invalid",
                severity: "error",
                message: "runtime.sessionId must be a non-empty string.",
            });
        }
        if (runtime.requestId !== undefined && !isNonEmptyString(runtime.requestId)) {
            issues.push({
                code: "pre-generated-round-request-id-invalid",
                severity: "error",
                message: "runtime.requestId must be a non-empty string when present.",
            });
        }
        if (!isFiniteNumber(runtime.balanceBefore)) {
            issues.push({
                code: "pre-generated-round-balance-before-invalid",
                severity: "error",
                message: "runtime.balanceBefore must be a finite number.",
            });
        }
        if (!isFiniteNumber(runtime.balanceAfter)) {
            issues.push({
                code: "pre-generated-round-balance-after-invalid",
                severity: "error",
                message: "runtime.balanceAfter must be a finite number.",
            });
        }
        if (!Array.isArray(runtime.transactions)) {
            issues.push({code: "pre-generated-round-transactions-invalid", severity: "error", message: "runtime.transactions must be an array."});
            return;
        }
        runtime.transactions.forEach((transaction: unknown, index: number) => {
            const t = transaction as Loose<{id: unknown; type: unknown; amount: unknown}> | null;
            const valid =
                typeof t === "object" &&
                t !== null &&
                isNonEmptyString(t.id) &&
                (t.type === "debit" || t.type === "credit") &&
                isFiniteNumber(t.amount) &&
                t.amount >= 0;
            if (!valid) {
                issues.push({
                    code: "pre-generated-round-transaction-invalid",
                    severity: "error",
                    message: `runtime.transactions[${index}] is malformed.`,
                    details: {index},
                });
            }
        });
    }

    private validateJsonSafety(result: PreGeneratedRoundResult<T>, issues: ValidationIssue[]): void {
        try {
            toCanonicalJson(result);
        } catch (error) {
            issues.push({
                code: "pre-generated-round-not-json-safe",
                severity: "error",
                message: error instanceof InvalidJsonValueError ? error.message : String(error),
            });
        }
    }
}
