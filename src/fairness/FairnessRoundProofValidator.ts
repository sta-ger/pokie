import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {POKIE_FAIRNESS_ALGORITHM_VERSION} from "./FairnessAlgorithmVersion.js";
import type {FairnessRoundProofValidating} from "./FairnessRoundProofValidating.js";
import {FAIRNESS_ROUND_PROOF_SCHEMA_VERSION} from "./FairnessRoundProof.js";
import {isFairnessRoundProofShape} from "./internal/fairnessShapeGuards.js";
import {sha256OfBytes} from "./internal/sha256OfBytes.js";

// Never throws (top-level shape guard first, same "never throw, return diagnostics" contract every other
// validator in this codebase follows) — a candidate that isn't even shaped like a FairnessRoundProof is reported
// as a single diagnostic rather than crashing the caller.
export class FairnessRoundProofValidator implements FairnessRoundProofValidating {
    public validate(candidate: unknown): ValidationIssue[] {
        if (!isFairnessRoundProofShape(candidate)) {
            return [
                {
                    code: "fairness-round-proof-malformed",
                    severity: "error",
                    message: "does not match the expected FairnessRoundProof shape.",
                },
            ];
        }

        const proof = candidate;
        const issues: ValidationIssue[] = [];

        if (proof.schemaVersion !== FAIRNESS_ROUND_PROOF_SCHEMA_VERSION) {
            issues.push({
                code: "fairness-round-proof-schema-version-unsupported",
                severity: "error",
                message: `schemaVersion is ${String(proof.schemaVersion)}, expected ${FAIRNESS_ROUND_PROOF_SCHEMA_VERSION}.`,
            });
        }

        if (proof.algorithmVersion !== POKIE_FAIRNESS_ALGORITHM_VERSION) {
            issues.push({
                code: "fairness-round-proof-algorithm-unsupported",
                severity: "error",
                message: `algorithmVersion "${proof.algorithmVersion}" is not supported (expected "${POKIE_FAIRNESS_ALGORITHM_VERSION}").`,
            });
        }

        // The one check unique to a commit-reveal scheme: a revealed serverSeed that doesn't hash to its own
        // recorded serverSeedHash is either an invalid seed or one substituted after the fact — either way, the
        // whole point of committing to serverSeedHash before selection is defeated, so this is checked here,
        // self-contained, before any bundle is ever touched.
        if (sha256OfBytes(proof.serverSeed) !== proof.serverSeedHash) {
            issues.push({
                code: "fairness-round-proof-server-seed-mismatch",
                severity: "error",
                message: "the revealed serverSeed does not hash to its own recorded serverSeedHash — invalid or tampered seed.",
            });
        }

        return issues;
    }
}
