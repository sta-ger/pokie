import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ValidationRule} from "../validation/ValidationRule.js";
import type {RoundArtifact} from "./RoundArtifact.js";

const FLOAT_EPSILON = 1e-9;

// Structural invariants a RoundArtifact must satisfy regardless of how it was built — reuses the existing
// generic ValidationRule<T> contract (same as PokieGameContractValidationRule/GameBlueprintValidator) rather
// than a bespoke validating interface.
export class RoundArtifactValidator<T extends string | number | symbol = string>
implements ValidationRule<RoundArtifact<T>> {
    public validate(artifact: RoundArtifact<T>): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        if (artifact.roundId.trim().length === 0) {
            issues.push({
                code: "round-artifact-round-id-missing",
                severity: "error",
                message: "roundId must be a non-empty string.",
            });
        }

        this.validateProvenance(artifact, issues);

        if (artifact.stake < 0) {
            issues.push({
                code: "round-artifact-stake-negative",
                severity: "error",
                message: `stake must be >= 0, got ${artifact.stake}.`,
            });
        }

        if (artifact.totalWin < 0) {
            issues.push({
                code: "round-artifact-total-win-negative",
                severity: "error",
                message: `totalWin must be >= 0, got ${artifact.totalWin}.`,
            });
        }

        const expectedPayoutMultiplier = artifact.stake > 0 ? artifact.totalWin / artifact.stake : 0;
        if (Math.abs(artifact.payoutMultiplier - expectedPayoutMultiplier) > FLOAT_EPSILON) {
            issues.push({
                code: "round-artifact-payout-multiplier-mismatch",
                severity: "error",
                message: `payoutMultiplier (${artifact.payoutMultiplier}) does not match totalWin/stake (${expectedPayoutMultiplier}).`,
                details: {payoutMultiplier: artifact.payoutMultiplier, expected: expectedPayoutMultiplier},
            });
        }

        if (artifact.steps.length === 0) {
            issues.push({
                code: "round-artifact-steps-empty",
                severity: "error",
                message: "steps must contain at least one step.",
            });
        }

        artifact.steps.forEach((step, position) => {
            if (step.index !== position) {
                issues.push({
                    code: "round-artifact-step-index-out-of-sequence",
                    severity: "error",
                    message: `step at position ${position} has index ${step.index}, expected ${position}.`,
                    details: {position, index: step.index},
                });
            }
        });

        const stepsTotalWin = artifact.steps.reduce((sum, step) => sum + step.totalWin, 0);
        if (Math.abs(stepsTotalWin - artifact.totalWin) > FLOAT_EPSILON) {
            issues.push({
                code: "round-artifact-total-win-mismatch",
                severity: "error",
                message: `totalWin (${artifact.totalWin}) does not match the sum of each step's totalWin (${stepsTotalWin}).`,
                details: {totalWin: artifact.totalWin, stepsTotalWin},
            });
        }

        const stepsWinsCount = artifact.steps.reduce((sum, step) => sum + step.wins.length, 0);
        if (stepsWinsCount !== artifact.wins.length) {
            issues.push({
                code: "round-artifact-wins-count-mismatch",
                severity: "error",
                message: `wins has ${artifact.wins.length} entries, expected ${stepsWinsCount} (the sum of each step's wins).`,
                details: {winsCount: artifact.wins.length, stepsWinsCount},
            });
        }

        return issues;
    }

    private validateProvenance(artifact: RoundArtifact<T>, issues: ValidationIssue[]): void {
        (["id", "name", "version"] as const).forEach((field) => {
            const value = artifact.provenance.game[field];
            if (typeof value !== "string" || value.trim().length === 0) {
                issues.push({
                    code: `round-artifact-provenance-game-${field}-invalid`,
                    severity: "error",
                    message: `provenance.game.${field} must be a non-empty string.`,
                });
            }
        });

        if (artifact.provenance.pokieVersion.trim().length === 0) {
            issues.push({
                code: "round-artifact-provenance-pokie-version-invalid",
                severity: "error",
                message: "provenance.pokieVersion must be a non-empty string.",
            });
        }
    }
}
