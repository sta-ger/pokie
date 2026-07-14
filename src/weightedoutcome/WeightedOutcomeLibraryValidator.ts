import type {RoundArtifact} from "../artifact/RoundArtifact.js";
import {RoundArtifactValidator} from "../artifact/RoundArtifactValidator.js";
import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ValidationRule} from "../validation/ValidationRule.js";
import {WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION, type WeightedOutcomeLibrary} from "./WeightedOutcomeLibrary.js";
import type {WeightedOutcome} from "./WeightedOutcome.js";

// A WeightedOutcomeLibrary's own static type guarantees nothing about a value that actually arrives at
// runtime — see RoundArtifactValidator's own doc comment for why every field here is read through this
// loosened view instead.
type Loose<X> = {[K in keyof X]?: unknown};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

// Structural invariants a WeightedOutcomeLibrary must satisfy regardless of how it was built or where it came
// from — reuses the existing generic ValidationRule<T> contract (same as RoundArtifactValidator itself,
// injected here rather than reimplemented) to validate each outcome's own RoundArtifact, so "artifact
// consistency" is exactly RoundArtifactValidator's own definition of validity, not a second one. Never throws:
// every check is defensive about the actual runtime shape of its input, and the top-level validate() wraps
// everything in a catch-all so a genuinely malformed library still comes back as a ValidationIssue, not an
// exception.
export class WeightedOutcomeLibraryValidator<T extends string | number = string>
implements ValidationRule<WeightedOutcomeLibrary<T>> {
    private readonly artifactValidator: ValidationRule<RoundArtifact<T>>;

    constructor(artifactValidator: ValidationRule<RoundArtifact<T>> = new RoundArtifactValidator<T>()) {
        this.artifactValidator = artifactValidator;
    }

    public validate(library: WeightedOutcomeLibrary<T>): ValidationIssue[] {
        try {
            return this.validateInternal(library);
        } catch (error) {
            return [
                {
                    code: "weighted-outcome-library-malformed",
                    severity: "error",
                    message: `WeightedOutcomeLibrary could not be validated: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }
    }

    private validateInternal(library: WeightedOutcomeLibrary<T>): ValidationIssue[] {
        const l = library as unknown as Loose<WeightedOutcomeLibrary<T>>;
        const issues: ValidationIssue[] = [];

        if (!isNonEmptyString(l.libraryId)) {
            issues.push({
                code: "weighted-outcome-library-id-invalid",
                severity: "error",
                message: "libraryId must be a non-empty string.",
            });
        }

        this.validateSchemaVersion(l, issues);
        this.validateOutcomes(l, issues);
        this.validateJsonSafety(library, issues);

        return issues;
    }

    private validateSchemaVersion(l: Loose<WeightedOutcomeLibrary<T>>, issues: ValidationIssue[]): void {
        if (typeof l.schemaVersion !== "number" || !Number.isInteger(l.schemaVersion) || l.schemaVersion < 1) {
            issues.push({
                code: "weighted-outcome-library-schema-version-invalid",
                severity: "error",
                message: `schemaVersion must be a positive integer, got ${String(l.schemaVersion)}.`,
            });
            return;
        }
        if (l.schemaVersion !== WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION) {
            issues.push({
                code: "weighted-outcome-library-schema-version-unsupported",
                severity: "error",
                message: `schemaVersion ${l.schemaVersion} is not supported (expected ${WEIGHTED_OUTCOME_LIBRARY_SCHEMA_VERSION}).`,
            });
        }
    }

    private validateOutcomes(l: Loose<WeightedOutcomeLibrary<T>>, issues: ValidationIssue[]): void {
        if (!Array.isArray(l.outcomes)) {
            issues.push({
                code: "weighted-outcome-library-outcomes-invalid",
                severity: "error",
                message: "outcomes must be an array.",
            });
            return;
        }
        if (l.outcomes.length === 0) {
            issues.push({
                code: "weighted-outcome-library-outcomes-empty",
                severity: "error",
                message: "outcomes must contain at least one outcome.",
            });
            return;
        }

        const seenIds = new Set<string>();
        let totalWeight = 0;

        l.outcomes.forEach((outcome: unknown, position: number) => {
            const o = outcome as Loose<WeightedOutcome<T>> | null;
            if (typeof o !== "object" || o === null) {
                issues.push({
                    code: "weighted-outcome-invalid",
                    severity: "error",
                    message: `outcome at position ${position} must be an object.`,
                    details: {position},
                });
                return;
            }

            if (!isNonEmptyString(o.id)) {
                issues.push({
                    code: "weighted-outcome-id-invalid",
                    severity: "error",
                    message: `outcome at position ${position} has an invalid id.`,
                    details: {position},
                });
            } else if (seenIds.has(o.id)) {
                issues.push({
                    code: "weighted-outcome-library-duplicate-id",
                    severity: "error",
                    message: `outcome id "${o.id}" is used by more than one outcome.`,
                    details: {position, id: o.id},
                });
            } else {
                seenIds.add(o.id);
            }

            if (!isFiniteNumber(o.weight) || o.weight < 0) {
                issues.push({
                    code: "weighted-outcome-weight-invalid",
                    severity: "error",
                    message: `outcome at position ${position} has an invalid weight, got ${String(o.weight)}.`,
                    details: {position, weight: o.weight},
                });
            } else {
                totalWeight += o.weight;
            }

            this.validateOutcomeArtifact(o.artifact, position, issues);
        });

        if (totalWeight <= 0) {
            issues.push({
                code: "weighted-outcome-library-total-weight-invalid",
                severity: "error",
                message: `the sum of all outcome weights must be > 0, got ${totalWeight}.`,
            });
        }
    }

    private validateOutcomeArtifact(artifact: unknown, position: number, issues: ValidationIssue[]): void {
        if (typeof artifact !== "object" || artifact === null) {
            issues.push({
                code: "weighted-outcome-artifact-invalid",
                severity: "error",
                message: `outcome at position ${position} must have an artifact object.`,
                details: {position},
            });
            return;
        }

        const payoutMultiplier = (artifact as Loose<RoundArtifact<T>>).payoutMultiplier;
        if (!isFiniteNumber(payoutMultiplier) || payoutMultiplier < 0) {
            issues.push({
                code: "weighted-outcome-payout-multiplier-invalid",
                severity: "error",
                message: `outcome at position ${position} has an invalid artifact.payoutMultiplier, got ${String(payoutMultiplier)}.`,
                details: {position, payoutMultiplier},
            });
        }

        this.artifactValidator.validate(artifact as RoundArtifact<T>).forEach((issue) => {
            issues.push({
                ...issue,
                message: `outcome at position ${position}: ${issue.message}`,
                details: {...issue.details, outcomePosition: position},
            });
        });
    }

    private validateJsonSafety(library: WeightedOutcomeLibrary<T>, issues: ValidationIssue[]): void {
        try {
            toCanonicalJson(library);
        } catch (error) {
            issues.push({
                code: "weighted-outcome-library-not-json-safe",
                severity: "error",
                message: error instanceof InvalidJsonValueError ? error.message : String(error),
            });
        }
    }
}
