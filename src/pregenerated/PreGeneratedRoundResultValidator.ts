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

const FLOAT_EPSILON = 1e-9;

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

        this.validateTransactionConsistency(
            r.runtime as Loose<PreGeneratedRoundResult<T>["runtime"]> | undefined,
            r.artifact as Loose<PreGeneratedRoundResult<T>["artifact"]> | undefined,
            issues,
        );

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
        const weightValid = isFiniteNumber(selection.weight) && selection.weight > 0;
        if (!weightValid) {
            issues.push({
                code: "pre-generated-round-selection-weight-invalid",
                severity: "error",
                message: `selection.weight must be a finite number > 0, got ${String(selection.weight)}.`,
            });
        }
        const totalWeightValid = isFiniteNumber(selection.totalWeight) && selection.totalWeight > 0;
        if (!totalWeightValid) {
            issues.push({
                code: "pre-generated-round-selection-total-weight-invalid",
                severity: "error",
                message: `selection.totalWeight must be a finite number > 0, got ${String(selection.totalWeight)}.`,
            });
        }
        if (weightValid && totalWeightValid && (selection.weight as number) > (selection.totalWeight as number)) {
            issues.push({
                code: "pre-generated-round-selection-weight-exceeds-total",
                severity: "error",
                message: `selection.weight (${String(selection.weight)}) must not exceed selection.totalWeight (${String(selection.totalWeight)}).`,
            });
        }
        if (!isFiniteNumber(selection.probability) || selection.probability <= 0 || selection.probability > 1) {
            issues.push({
                code: "pre-generated-round-selection-probability-invalid",
                severity: "error",
                message: `selection.probability must be a finite number in (0, 1], got ${String(selection.probability)}.`,
            });
        } else if (weightValid && totalWeightValid) {
            const expectedProbability = (selection.weight as number) / (selection.totalWeight as number);
            if (Math.abs(selection.probability - expectedProbability) > FLOAT_EPSILON) {
                issues.push({
                    code: "pre-generated-round-selection-probability-mismatch",
                    severity: "error",
                    message: `selection.probability (${selection.probability}) does not match weight/totalWeight (${expectedProbability}).`,
                    details: {probability: selection.probability, expected: expectedProbability},
                });
            }
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
        const seenTransactionIds = new Set<string>();
        let reportedDuplicate = false;
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
                return;
            }
            const id = (t as {id: string}).id;
            if (seenTransactionIds.has(id)) {
                if (!reportedDuplicate) {
                    issues.push({
                        code: "pre-generated-round-transaction-ids-not-unique",
                        severity: "error",
                        message: `runtime.transactions contains more than one entry with id "${id}".`,
                        details: {id},
                    });
                    reportedDuplicate = true;
                }
            } else {
                seenTransactionIds.add(id);
            }
        });
    }

    // Cross-checks runtime.transactions against artifact.stake/artifact.totalWin (and against each
    // other, for balanceAfter) — invariants that span both the "selection" and "artifact" that no
    // single-field check above can catch: a forged debit/credit amount, or a balanceAfter that doesn't
    // actually reconcile with balanceBefore and the transactions that supposedly produced it. Skips
    // silently (relying on validateRuntime's own per-entry check having already reported it) when
    // runtime/artifact/transactions aren't even structurally sound enough to sum.
    private validateTransactionConsistency(
        runtime: Loose<PreGeneratedRoundResult<T>["runtime"]> | undefined,
        artifact: Loose<PreGeneratedRoundResult<T>["artifact"]> | undefined,
        issues: ValidationIssue[],
    ): void {
        if (typeof runtime !== "object" || runtime === null || !Array.isArray(runtime.transactions)) {
            return;
        }
        if (typeof artifact !== "object" || artifact === null) {
            return;
        }

        const transactions = runtime.transactions as Loose<{id: unknown; type: unknown; amount: unknown}>[];
        const allEntriesValid = transactions.every(
            (t) => typeof t === "object" && t !== null && (t.type === "debit" || t.type === "credit") && isFiniteNumber(t.amount) && (t.amount as number) >= 0,
        );
        if (!allEntriesValid) {
            return;
        }

        const totalDebit = transactions.filter((t) => t.type === "debit").reduce((sum, t) => sum + (t.amount as number), 0);
        const totalCredit = transactions.filter((t) => t.type === "credit").reduce((sum, t) => sum + (t.amount as number), 0);

        if (isFiniteNumber(artifact.stake) && Math.abs(totalDebit - artifact.stake) > FLOAT_EPSILON) {
            issues.push({
                code: "pre-generated-round-transactions-debit-mismatch",
                severity: "error",
                message: `runtime.transactions' total debit (${totalDebit}) does not match artifact.stake (${artifact.stake}).`,
                details: {totalDebit, stake: artifact.stake},
            });
        }
        if (isFiniteNumber(artifact.totalWin) && Math.abs(totalCredit - artifact.totalWin) > FLOAT_EPSILON) {
            issues.push({
                code: "pre-generated-round-transactions-credit-mismatch",
                severity: "error",
                message: `runtime.transactions' total credit (${totalCredit}) does not match artifact.totalWin (${artifact.totalWin}).`,
                details: {totalCredit, totalWin: artifact.totalWin},
            });
        }

        if (isFiniteNumber(runtime.balanceBefore) && isFiniteNumber(runtime.balanceAfter)) {
            const expectedBalanceAfter = runtime.balanceBefore - totalDebit + totalCredit;
            if (Math.abs(runtime.balanceAfter - expectedBalanceAfter) > FLOAT_EPSILON) {
                issues.push({
                    code: "pre-generated-round-balance-mismatch",
                    severity: "error",
                    message: `runtime.balanceAfter (${runtime.balanceAfter}) does not reconcile with balanceBefore (${runtime.balanceBefore}) and transactions (expected ${expectedBalanceAfter}).`,
                    details: {balanceBefore: runtime.balanceBefore, balanceAfter: runtime.balanceAfter, expected: expectedBalanceAfter},
                });
            }
        }
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
