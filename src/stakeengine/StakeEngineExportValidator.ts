import type {ValidationIssue} from "../validation/ValidationIssue.js";
import {WeightedOutcomeLibraryValidator} from "../weightedoutcome/WeightedOutcomeLibraryValidator.js";
import {convertRatioToStakeUnits} from "./internal/convertRatioToStakeUnits.js";
import {parseStakeEngineOutcomeId} from "./internal/parseStakeEngineOutcomeId.js";
import type {StakeEngineExportModeInput} from "./StakeEngineExportModeInput.js";
import type {StakeEngineExportValidating} from "./StakeEngineExportValidating.js";

// A single mode's provenance, read off its library's first outcome — used to check every mode in an export
// shares the same underlying game/config/pokieVersion (betMode/stake are expected to differ per mode, that's
// the whole point of having more than one mode).
type ModeProvenanceKey = {
    gameId: unknown;
    gameVersion: unknown;
    configHash: unknown;
    pokieVersion: unknown;
};

function provenanceKeyOf<T extends string | number>(mode: StakeEngineExportModeInput<T>): ModeProvenanceKey | undefined {
    const firstOutcome = mode.library.outcomes[0];
    const provenance = firstOutcome?.artifact?.provenance;
    if (provenance === undefined) {
        return undefined;
    }
    return {
        gameId: provenance.game?.id,
        gameVersion: provenance.game?.version,
        configHash: provenance.configHash,
        pokieVersion: provenance.pokieVersion,
    };
}

// Validates a whole Stake Engine export request — an array of {modeName, cost, library} entries — additively
// on top of WeightedOutcomeLibraryValidator, which always runs against every mode's own library first (so a
// malformed library is never treated as valid here, the same "additive, never replacing" convention as
// WeightedOutcomeLibraryValidator's own extraArtifactValidator). Never throws.
export class StakeEngineExportValidator<T extends string | number = string> implements StakeEngineExportValidating<T> {
    private readonly libraryValidator = new WeightedOutcomeLibraryValidator<T>();

    public validate(modes: readonly StakeEngineExportModeInput<T>[]): ValidationIssue[] {
        try {
            return this.validateInternal(modes);
        } catch (error) {
            return [
                {
                    code: "stakeengine-export-malformed",
                    severity: "error",
                    message: `Stake Engine export request could not be validated: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }
    }

    private validateInternal(modes: readonly StakeEngineExportModeInput<T>[]): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        if (modes.length === 0) {
            issues.push({
                code: "stakeengine-export-modes-empty",
                severity: "error",
                message: "Stake Engine export requires at least one mode.",
            });
            return issues;
        }

        const seenNames = new Map<string, string>(); // lowercase name -> original name, for case-collision detection
        let reference: ModeProvenanceKey | undefined;

        modes.forEach((mode, position) => {
            this.libraryValidator.validate(mode.library).forEach((issue) => {
                issues.push({
                    ...issue,
                    message: `mode "${mode.modeName}": ${issue.message}`,
                    details: {...issue.details, modeName: mode.modeName},
                });
            });

            this.validateModeName(mode, position, seenNames, issues);

            if (!Number.isFinite(mode.cost) || mode.cost <= 0) {
                issues.push({
                    code: "stakeengine-mode-cost-invalid",
                    severity: "error",
                    message: `mode "${mode.modeName}" has an invalid cost (${mode.cost}); must be a finite number > 0.`,
                    details: {modeName: mode.modeName, cost: mode.cost},
                });
            }

            const current = provenanceKeyOf(mode);
            if (reference === undefined) {
                reference = current;
            } else if (
                current !== undefined &&
                (current.gameId !== reference.gameId ||
                    current.gameVersion !== reference.gameVersion ||
                    current.configHash !== reference.configHash ||
                    current.pokieVersion !== reference.pokieVersion)
            ) {
                issues.push({
                    code: "stakeengine-cross-mode-provenance-mismatch",
                    severity: "error",
                    message: `mode "${mode.modeName}" has different provenance (game id/version, configHash, or pokieVersion) than the export's other modes.`,
                    details: {modeName: mode.modeName},
                });
            }

            this.validateOutcomeIntegers(mode, issues);
        });

        return issues;
    }

    private validateModeName(
        mode: StakeEngineExportModeInput<T>,
        position: number,
        seenNames: Map<string, string>,
        issues: ValidationIssue[],
    ): void {
        if (typeof mode.modeName !== "string" || !(/^[A-Za-z0-9_-]+$/).test(mode.modeName)) {
            issues.push({
                code: "stakeengine-mode-name-invalid",
                severity: "error",
                message: `mode at position ${position} has an invalid modeName (${JSON.stringify(mode.modeName)}); must be a non-empty string matching [A-Za-z0-9_-]+.`,
                details: {position, modeName: mode.modeName},
            });
            return;
        }

        const lowerName = mode.modeName.toLowerCase();
        const existing = seenNames.get(lowerName);
        if (existing === undefined) {
            seenNames.set(lowerName, mode.modeName);
            return;
        }

        if (existing === mode.modeName) {
            issues.push({
                code: "stakeengine-duplicate-mode-name",
                severity: "error",
                message: `modeName "${mode.modeName}" is used by more than one mode.`,
                details: {modeName: mode.modeName},
            });
        } else {
            issues.push({
                code: "stakeengine-mode-name-case-collision",
                severity: "error",
                message: `modeName "${mode.modeName}" differs only in case from modeName "${existing}"; these would write the same files ("lookup_${mode.modeName}.csv"/"books_${mode.modeName}.jsonl.zst") on a case-insensitive filesystem, so the export is refused rather than risk one mode silently overwriting the other's output.`,
                details: {modeName: mode.modeName, collidesWith: existing},
            });
        }
    }

    private validateOutcomeIntegers(mode: StakeEngineExportModeInput<T>, issues: ValidationIssue[]): void {
        mode.library.outcomes.forEach((outcome) => {
            if (parseStakeEngineOutcomeId(outcome.id) === undefined) {
                issues.push({
                    code: "stakeengine-outcome-id-not-integer",
                    severity: "error",
                    message: `mode "${mode.modeName}": outcome id "${outcome.id}" is not a canonical non-negative integer string, as Stake Engine requires.`,
                    details: {modeName: mode.modeName, id: outcome.id},
                });
            }

            if (!Number.isInteger(outcome.weight)) {
                issues.push({
                    code: "stakeengine-outcome-weight-not-integer",
                    severity: "error",
                    message: `mode "${mode.modeName}": outcome "${outcome.id}" has a non-integer weight (${outcome.weight}); Stake Engine requires integer weights.`,
                    details: {modeName: mode.modeName, id: outcome.id, weight: outcome.weight},
                });
            }

            if (convertRatioToStakeUnits(outcome.artifact.payoutMultiplier, mode.cost) === undefined) {
                issues.push({
                    code: "stakeengine-outcome-payout-multiplier-not-representable",
                    severity: "error",
                    message:
                        `mode "${mode.modeName}": outcome "${outcome.id}"'s artifact.payoutMultiplier (${outcome.artifact.payoutMultiplier}) is not representable as a ` +
                        `non-negative safe integer once converted to Stake units (payoutMultiplier * cost (${mode.cost}) * 100), and Stake Engine requires an exact ` +
                        "integer — POKIE never rounds this conversion.",
                    details: {modeName: mode.modeName, id: outcome.id, payoutMultiplier: outcome.artifact.payoutMultiplier, cost: mode.cost},
                });
            }
        });
    }
}
