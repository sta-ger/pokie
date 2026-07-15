import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {POKIE_FAIRNESS_ALGORITHM_VERSION} from "./FairnessAlgorithmVersion.js";
import {FAIRNESS_COMMITMENT_SCHEMA_VERSION} from "./FairnessCommitment.js";
import type {FairnessCommitmentValidating} from "./FairnessCommitmentValidating.js";
import {isFairnessCommitmentShape} from "./internal/fairnessShapeGuards.js";

// Never throws (top-level shape guard first, same "never throw, return diagnostics" contract every other
// validator in this codebase follows) — a candidate that isn't even shaped like a FairnessCommitment is reported
// as a single diagnostic rather than crashing the caller.
export class FairnessCommitmentValidator implements FairnessCommitmentValidating {
    public validate(candidate: unknown): ValidationIssue[] {
        if (!isFairnessCommitmentShape(candidate)) {
            return [
                {
                    code: "fairness-commitment-malformed",
                    severity: "error",
                    message: "does not match the expected FairnessCommitment shape.",
                },
            ];
        }

        const commitment = candidate;
        const issues: ValidationIssue[] = [];

        if (commitment.schemaVersion !== FAIRNESS_COMMITMENT_SCHEMA_VERSION) {
            issues.push({
                code: "fairness-commitment-schema-version-unsupported",
                severity: "error",
                message: `schemaVersion is ${String(commitment.schemaVersion)}, expected ${FAIRNESS_COMMITMENT_SCHEMA_VERSION}.`,
            });
        }

        if (commitment.algorithmVersion !== POKIE_FAIRNESS_ALGORITHM_VERSION) {
            issues.push({
                code: "fairness-commitment-algorithm-unsupported",
                severity: "error",
                message: `algorithmVersion "${commitment.algorithmVersion}" is not supported (expected "${POKIE_FAIRNESS_ALGORITHM_VERSION}").`,
            });
        }

        return issues;
    }
}
