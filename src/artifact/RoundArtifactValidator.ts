import {InvalidJsonValueError} from "../json/InvalidJsonValueError.js";
import {toCanonicalJson} from "../json/toCanonicalJson.js";
import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {ValidationRule} from "../validation/ValidationRule.js";
import {ROUND_ARTIFACT_SCHEMA_VERSION, type RoundArtifact} from "./RoundArtifact.js";
import type {RoundArtifactWin} from "./RoundArtifactWin.js";

const FLOAT_EPSILON = 1e-9;

// A RoundArtifact's own static type guarantees nothing about a value that actually arrives at runtime — e.g.
// one round-tripped through JSON.parse and cast back to RoundArtifact<T>, or hand-crafted in a test. Every
// field is read through this loosened view so the checks below are real runtime guards, not the compiler
// simply agreeing with itself that an already-`string`-typed field is a string.
type Loose<X> = {[K in keyof X]?: unknown};

function isFiniteNumber(value: unknown): value is number {
    return typeof value === "number" && Number.isFinite(value);
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// Structural equality with no assumption that either side is JSON-safe: NaN compares equal to itself (via
// Object.is), and a depth cap stands in for cycle detection (an artifact that's passed the JSON-safety check
// elsewhere in this validator can't actually be cyclic, so the cap only ever matters for a malformed input that
// hasn't been — in which case reporting "not equal" is the correct, non-hanging outcome).
function deepEqual(a: unknown, b: unknown, depth = 0): boolean {
    if (depth > 100) {
        return false;
    }
    if (Object.is(a, b)) {
        return true;
    }
    if (Array.isArray(a) || Array.isArray(b)) {
        return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => deepEqual(value, b[index], depth + 1));
    }
    if (typeof a === "object" && a !== null && typeof b === "object" && b !== null) {
        const aKeys = Object.keys(a as Record<string, unknown>);
        const bKeys = Object.keys(b as Record<string, unknown>);
        return (
            aKeys.length === bKeys.length &&
            aKeys.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], depth + 1))
        );
    }
    return false;
}

// Structural invariants a RoundArtifact must satisfy regardless of how it was built or where it came from —
// reuses the existing generic ValidationRule<T> contract (same as PokieGameContractValidationRule/
// GameBlueprintValidator) rather than a bespoke validating interface. Never throws: every check is defensive
// about the actual runtime shape of its input (see Loose<X> above), and the top-level validate() wraps
// everything in a catch-all so a genuinely malformed artifact still comes back as a ValidationIssue, not an
// exception.
export class RoundArtifactValidator<T extends string | number | symbol = string>
implements ValidationRule<RoundArtifact<T>> {
    public validate(artifact: RoundArtifact<T>): ValidationIssue[] {
        try {
            return this.validateInternal(artifact);
        } catch (error) {
            return [
                {
                    code: "round-artifact-malformed",
                    severity: "error",
                    message: `RoundArtifact could not be validated: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }
    }

    private validateInternal(artifact: RoundArtifact<T>): ValidationIssue[] {
        const a = artifact as unknown as Loose<RoundArtifact<T>>;
        const issues: ValidationIssue[] = [];

        if (!isNonEmptyString(a.roundId)) {
            issues.push({code: "round-artifact-round-id-invalid", severity: "error", message: "roundId must be a non-empty string."});
        }

        this.validateSchemaVersion(a, issues);
        this.validateProvenance(a, issues);

        const stakeValid = isFiniteNumber(a.stake) && a.stake >= 0;
        if (!stakeValid) {
            issues.push({
                code: "round-artifact-stake-invalid",
                severity: "error",
                message: `stake must be a finite number >= 0, got ${String(a.stake)}.`,
            });
        }

        const totalWinValid = isFiniteNumber(a.totalWin) && a.totalWin >= 0;
        if (!totalWinValid) {
            issues.push({
                code: "round-artifact-total-win-invalid",
                severity: "error",
                message: `totalWin must be a finite number >= 0, got ${String(a.totalWin)}.`,
            });
        }

        if (stakeValid && totalWinValid) {
            const stake = a.stake as number;
            const totalWin = a.totalWin as number;
            const expectedPayoutMultiplier = stake > 0 ? totalWin / stake : 0;
            if (!isFiniteNumber(a.payoutMultiplier) || Math.abs(a.payoutMultiplier - expectedPayoutMultiplier) > FLOAT_EPSILON) {
                issues.push({
                    code: "round-artifact-payout-multiplier-mismatch",
                    severity: "error",
                    message: `payoutMultiplier (${String(a.payoutMultiplier)}) does not match totalWin/stake (${expectedPayoutMultiplier}).`,
                    details: {payoutMultiplier: a.payoutMultiplier, expected: expectedPayoutMultiplier},
                });
            }
        }

        this.validateFeatureEvents(a.featureEvents, "round", issues);
        const stepsWins = this.validateSteps(a, issues);
        this.validateWins(a, stepsWins, issues);
        this.validateScreen(a, issues);
        this.validateJsonSafety(artifact, issues);

        return issues;
    }

    private validateSchemaVersion(a: Loose<RoundArtifact<T>>, issues: ValidationIssue[]): void {
        if (typeof a.schemaVersion !== "number" || !Number.isInteger(a.schemaVersion) || a.schemaVersion < 1) {
            issues.push({
                code: "round-artifact-schema-version-invalid",
                severity: "error",
                message: `schemaVersion must be a positive integer, got ${String(a.schemaVersion)}.`,
            });
            return;
        }
        if (a.schemaVersion !== ROUND_ARTIFACT_SCHEMA_VERSION) {
            issues.push({
                code: "round-artifact-schema-version-unsupported",
                severity: "error",
                message: `schemaVersion ${a.schemaVersion} is not supported (expected ${ROUND_ARTIFACT_SCHEMA_VERSION}).`,
            });
        }
    }

    private validateProvenance(a: Loose<RoundArtifact<T>>, issues: ValidationIssue[]): void {
        const provenance = a.provenance as Loose<RoundArtifact<T>["provenance"]> | undefined;
        if (typeof provenance !== "object" || provenance === null) {
            issues.push({code: "round-artifact-provenance-invalid", severity: "error", message: "provenance must be an object."});
            return;
        }

        const game = provenance.game as Record<string, unknown> | undefined;
        if (typeof game !== "object" || game === null) {
            issues.push({code: "round-artifact-provenance-game-invalid", severity: "error", message: "provenance.game must be an object."});
        } else {
            (["id", "name", "version"] as const).forEach((field) => {
                if (!isNonEmptyString(game[field])) {
                    issues.push({
                        code: `round-artifact-provenance-game-${field}-invalid`,
                        severity: "error",
                        message: `provenance.game.${field} must be a non-empty string.`,
                    });
                }
            });
        }

        if (!isNonEmptyString(provenance.pokieVersion)) {
            issues.push({
                code: "round-artifact-provenance-pokie-version-invalid",
                severity: "error",
                message: "provenance.pokieVersion must be a non-empty string.",
            });
        }
    }

    private validateFeatureEvents(events: unknown, scope: string, issues: ValidationIssue[]): void {
        if (events === undefined) {
            return;
        }
        if (!Array.isArray(events)) {
            issues.push({
                code: "round-artifact-feature-events-invalid",
                severity: "error",
                message: `${scope} featureEvents must be an array.`,
            });
            return;
        }
        events.forEach((event, index) => {
            const type = (event as Loose<{type: unknown}> | null)?.type;
            if (!isNonEmptyString(type)) {
                issues.push({
                    code: "round-artifact-feature-event-type-invalid",
                    severity: "error",
                    message: `${scope} featureEvents[${index}] must have a non-empty "type".`,
                    details: {scope, index},
                });
            }
        });
    }

    // Validates step-level structure (index sequence, per-step totalWin-vs-own-wins, round-level totalWin vs
    // the sum of each step's totalWin) and returns every step's wins flattened, for validateWins to compare
    // against the round-level "wins" field.
    private validateSteps(a: Loose<RoundArtifact<T>>, issues: ValidationIssue[]): unknown[] {
        if (!Array.isArray(a.steps)) {
            issues.push({code: "round-artifact-steps-invalid", severity: "error", message: "steps must be an array."});
            return [];
        }
        if (a.steps.length === 0) {
            issues.push({code: "round-artifact-steps-empty", severity: "error", message: "steps must contain at least one step."});
            return [];
        }

        let stepsTotalWin = 0;
        const flattenedWins: unknown[] = [];

        a.steps.forEach((step: unknown, position: number) => {
            const s = step as Loose<RoundArtifact<T>["steps"][number]> | null;
            if (typeof s !== "object" || s === null || !Array.isArray(s.wins)) {
                issues.push({
                    code: "round-artifact-step-invalid",
                    severity: "error",
                    message: `step at position ${position} is malformed (must be an object with a "wins" array).`,
                    details: {position},
                });
                return;
            }

            if (s.index !== position) {
                issues.push({
                    code: "round-artifact-step-index-out-of-sequence",
                    severity: "error",
                    message: `step at position ${position} has index ${String(s.index)}, expected ${position}.`,
                    details: {position, index: s.index},
                });
            }

            this.validateFeatureEvents(s.featureEvents, `step ${position}`, issues);

            const ownWinsSum = (s.wins as unknown[]).reduce((sum: number, win) => {
                const amount = (win as Loose<RoundArtifactWin<T>> | null)?.winAmount;
                return sum + (isFiniteNumber(amount) ? amount : 0);
            }, 0);

            if (!isFiniteNumber(s.totalWin) || Math.abs(s.totalWin - ownWinsSum) > FLOAT_EPSILON) {
                issues.push({
                    code: "round-artifact-step-total-win-mismatch",
                    severity: "error",
                    message: `step at position ${position} totalWin (${String(s.totalWin)}) does not match the sum of its own wins (${ownWinsSum}).`,
                    details: {position, totalWin: s.totalWin, expected: ownWinsSum},
                });
            } else {
                stepsTotalWin += s.totalWin;
            }

            flattenedWins.push(...(s.wins as unknown[]));
        });

        if (isFiniteNumber(a.totalWin) && Math.abs(stepsTotalWin - a.totalWin) > FLOAT_EPSILON) {
            issues.push({
                code: "round-artifact-total-win-mismatch",
                severity: "error",
                message: `totalWin (${a.totalWin}) does not match the sum of each step's totalWin (${stepsTotalWin}).`,
                details: {totalWin: a.totalWin, stepsTotalWin},
            });
        }

        return flattenedWins;
    }

    // Checks both that "wins" has the right shape (finite, non-negative winAmount per entry) and that it's
    // exactly the flattened concatenation of every step's own wins — not just the same length (two artifacts
    // can have the same win *count* per step while actually containing different wins).
    private validateWins(a: Loose<RoundArtifact<T>>, stepsWins: unknown[], issues: ValidationIssue[]): void {
        if (!Array.isArray(a.wins)) {
            issues.push({code: "round-artifact-wins-invalid", severity: "error", message: "wins must be an array."});
            return;
        }

        a.wins.forEach((win: unknown, index: number) => {
            const amount = (win as Loose<RoundArtifactWin<T>> | null)?.winAmount;
            if (!isFiniteNumber(amount) || amount < 0) {
                issues.push({
                    code: "round-artifact-win-amount-invalid",
                    severity: "error",
                    message: `wins[${index}] has an invalid winAmount, got ${String(amount)}.`,
                    details: {index},
                });
            }
        });

        if (a.wins.length !== stepsWins.length) {
            issues.push({
                code: "round-artifact-wins-count-mismatch",
                severity: "error",
                message: `wins has ${a.wins.length} entries, expected ${stepsWins.length} (the sum of each step's wins).`,
                details: {winsCount: a.wins.length, stepsWinsCount: stepsWins.length},
            });
            return;
        }

        const mismatchIndex = a.wins.findIndex((win: unknown, index: number) => !deepEqual(win, stepsWins[index]));
        if (mismatchIndex !== -1) {
            issues.push({
                code: "round-artifact-wins-mismatch",
                severity: "error",
                message: `wins[${mismatchIndex}] does not match the corresponding entry in the flattened step wins — same count, different content.`,
                details: {index: mismatchIndex},
            });
        }
    }

    private validateScreen(a: Loose<RoundArtifact<T>>, issues: ValidationIssue[]): void {
        if (!Array.isArray(a.steps) || a.steps.length === 0) {
            return;
        }
        const lastStep = a.steps[a.steps.length - 1] as Loose<RoundArtifact<T>["steps"][number]> | null;
        if (typeof lastStep !== "object" || lastStep === null || lastStep.screen === undefined) {
            return;
        }
        if (!deepEqual(a.screen, lastStep.screen)) {
            issues.push({
                code: "round-artifact-screen-mismatch",
                severity: "error",
                message: "screen does not match the last step's screen.",
            });
        }
    }

    private validateJsonSafety(artifact: RoundArtifact<T>, issues: ValidationIssue[]): void {
        try {
            toCanonicalJson(artifact);
        } catch (error) {
            issues.push({
                code: "round-artifact-not-json-safe",
                severity: "error",
                message: error instanceof InvalidJsonValueError ? error.message : String(error),
            });
        }
    }
}
