import {RoundArtifactValidator} from "../artifact/RoundArtifactValidator.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ValidationRule} from "../validation/ValidationRule.js";
import {isPositiveSafeInteger} from "./internal/isPositiveSafeInteger.js";
import type {PreGeneratedOutcomeSelection} from "./PreGeneratedOutcomeSelection.js";

// A PreGeneratedOutcomeSelection's own static type guarantees nothing about a value that actually arrives at
// runtime — a hand-crafted/forged PreGeneratedOutcomeSourcing implementation (a test double, a buggy custom
// source) is just as capable of returning one as a real adapter is, so nothing downstream can trust its shape
// implicitly. See RoundArtifactValidator's own doc comment for why every field here is read through this
// loosened view instead.
type Loose<X> = {[K in keyof X]?: unknown};

const SHA256_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/;

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

function isValidLibraryHash(value: unknown): value is string {
    return typeof value === "string" && SHA256_HASH_PATTERN.test(value);
}

// Structural invariants a PreGeneratedOutcomeSelection must satisfy regardless of which PreGeneratedOutcomeSourcing
// implementation produced it — run twice, deliberately: once by PreGeneratedSpinCommandHandler immediately after
// drawOutcome() (before the session-identity check, the idempotency cache, and any wallet transaction — an
// invalid selection is treated the same as a source-level conflict, since it means the source can't be trusted
// for this draw), and again inside buildPreGeneratedRoundResult itself as a defensive backstop for any other
// caller of that function. Delegates the outcome's own artifact validity to a real RoundArtifactValidator, so
// "artifact validity" here is exactly RoundArtifactValidator's own definition, not a second one. Never throws:
// every check is defensive about the actual runtime shape of its input, and the top-level validate() wraps
// everything in a catch-all so a genuinely malformed selection still comes back as a ValidationIssue, not an
// exception.
export class PreGeneratedOutcomeSelectionValidator<T extends string | number = string>
implements ValidationRule<PreGeneratedOutcomeSelection<T>> {
    private readonly roundArtifactValidator = new RoundArtifactValidator<T>();

    public validate(selection: PreGeneratedOutcomeSelection<T>): ValidationIssue[] {
        try {
            return this.validateInternal(selection);
        } catch (error) {
            return [
                {
                    code: "pre-generated-outcome-selection-malformed",
                    severity: "error",
                    message: `PreGeneratedOutcomeSelection could not be validated: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }
    }

    private validateInternal(selection: PreGeneratedOutcomeSelection<T>): ValidationIssue[] {
        const s = selection as unknown as Loose<PreGeneratedOutcomeSelection<T>>;
        const issues: ValidationIssue[] = [];

        if (!isNonEmptyString(s.libraryId)) {
            issues.push({
                code: "pre-generated-outcome-selection-library-id-invalid",
                severity: "error",
                message: `libraryId must be a non-empty string, got ${JSON.stringify(s.libraryId)}.`,
            });
        }
        if (!isValidLibraryHash(s.libraryHash)) {
            issues.push({
                code: "pre-generated-outcome-selection-library-hash-invalid",
                severity: "error",
                message: `libraryHash must match "sha256:<64 hex chars>", got ${JSON.stringify(s.libraryHash)}.`,
            });
        }

        const totalWeightValid = isPositiveSafeInteger(s.totalWeight);
        if (!totalWeightValid) {
            issues.push({
                code: "pre-generated-outcome-selection-total-weight-invalid",
                severity: "error",
                message: `totalWeight must be a positive safe integer, got ${String(s.totalWeight)}.`,
            });
        }

        if (typeof s.outcome !== "object" || s.outcome === null) {
            issues.push({code: "pre-generated-outcome-selection-outcome-invalid", severity: "error", message: "outcome must be an object."});
            return issues;
        }

        const outcome = s.outcome as Loose<PreGeneratedOutcomeSelection<T>["outcome"]>;
        if (!isNonEmptyString(outcome.id)) {
            issues.push({
                code: "pre-generated-outcome-selection-outcome-id-invalid",
                severity: "error",
                message: `outcome.id must be a non-empty string, got ${JSON.stringify(outcome.id)}.`,
            });
        }

        const weightValid = isPositiveSafeInteger(outcome.weight);
        if (!weightValid) {
            issues.push({
                code: "pre-generated-outcome-selection-weight-invalid",
                severity: "error",
                message: `outcome.weight must be a positive safe integer, got ${String(outcome.weight)}.`,
            });
        }
        if (weightValid && totalWeightValid && (outcome.weight as number) > (s.totalWeight as number)) {
            issues.push({
                code: "pre-generated-outcome-selection-weight-exceeds-total",
                severity: "error",
                message: `outcome.weight (${String(outcome.weight)}) must not exceed totalWeight (${String(s.totalWeight)}).`,
            });
        }

        if (typeof outcome.artifact !== "object" || outcome.artifact === null) {
            issues.push({code: "pre-generated-outcome-selection-artifact-invalid", severity: "error", message: "outcome.artifact must be an object."});
        } else {
            this.roundArtifactValidator.validate(outcome.artifact as PreGeneratedOutcomeSelection<T>["outcome"]["artifact"]).forEach((issue) => issues.push(issue));
        }

        return issues;
    }
}
