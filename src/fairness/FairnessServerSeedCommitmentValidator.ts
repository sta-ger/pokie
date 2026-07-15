import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {POKIE_FAIRNESS_ALGORITHM_VERSION} from "./FairnessAlgorithmVersion.js";
import {FAIRNESS_SERVER_SEED_COMMITMENT_SCHEMA_VERSION} from "./FairnessServerSeedCommitment.js";
import type {FairnessServerSeedCommitmentValidating} from "./FairnessServerSeedCommitmentValidating.js";
import {isFairnessServerSeedCommitmentShape} from "./internal/fairnessShapeGuards.js";

// Never throws (top-level shape guard first, same "never throw, return diagnostics" contract every other
// validator in this codebase follows) — a candidate that isn't even shaped like a FairnessServerSeedCommitment
// is reported as a single diagnostic rather than crashing the caller.
export class FairnessServerSeedCommitmentValidator implements FairnessServerSeedCommitmentValidating {
    public validate(candidate: unknown): ValidationIssue[] {
        if (!isFairnessServerSeedCommitmentShape(candidate)) {
            return [
                {
                    code: "fairness-server-seed-commitment-malformed",
                    severity: "error",
                    message: "does not match the expected FairnessServerSeedCommitment shape.",
                },
            ];
        }

        const commitment = candidate;
        const issues: ValidationIssue[] = [];

        if (commitment.schemaVersion !== FAIRNESS_SERVER_SEED_COMMITMENT_SCHEMA_VERSION) {
            issues.push({
                code: "fairness-server-seed-commitment-schema-version-unsupported",
                severity: "error",
                message: `schemaVersion is ${String(commitment.schemaVersion)}, expected ${FAIRNESS_SERVER_SEED_COMMITMENT_SCHEMA_VERSION}.`,
            });
        }

        if (commitment.algorithmVersion !== POKIE_FAIRNESS_ALGORITHM_VERSION) {
            issues.push({
                code: "fairness-server-seed-commitment-algorithm-unsupported",
                severity: "error",
                message: `algorithmVersion "${commitment.algorithmVersion}" is not supported (expected "${POKIE_FAIRNESS_ALGORITHM_VERSION}").`,
            });
        }

        return issues;
    }
}
