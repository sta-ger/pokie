import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import {WeightedOutcomeLibraryValidator} from "../WeightedOutcomeLibraryValidator.js";
import type {OutcomeLibraryBundleModeInput} from "./OutcomeLibraryBundleModeInput.js";
import type {OutcomeLibraryBundleWriteValidating} from "./OutcomeLibraryBundleWriteValidating.js";

// A single mode's provenance, read off its library's first outcome — used to check every mode being written
// into one bundle shares the same underlying game/config/pokieVersion (betMode/stake are expected to differ per
// mode, that's the whole point of having more than one mode). Mirrors StakeEngineExportValidator's own
// ModeProvenanceKey exactly.
type ModeProvenanceKey = {
    gameId: unknown;
    gameVersion: unknown;
    configHash: unknown;
    pokieVersion: unknown;
};

function provenanceKeyOf<T extends string | number>(mode: OutcomeLibraryBundleModeInput<T>): ModeProvenanceKey | undefined {
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

// Validates a whole outcome-library bundle write request — an array of {modeName, library} entries —
// additively on top of WeightedOutcomeLibraryValidator, which always runs against every mode's own library
// first (so a malformed library is never treated as valid here). Never throws.
export class OutcomeLibraryBundleWriteValidator<T extends string | number = string> implements OutcomeLibraryBundleWriteValidating<T> {
    private readonly libraryValidator = new WeightedOutcomeLibraryValidator<T>();

    public validate(modes: readonly OutcomeLibraryBundleModeInput<T>[]): ValidationIssue[] {
        try {
            return this.validateInternal(modes);
        } catch (error) {
            return [
                {
                    code: "outcome-library-bundle-write-malformed",
                    severity: "error",
                    message: `Outcome library bundle write request could not be validated: ${error instanceof Error ? error.message : String(error)}`,
                },
            ];
        }
    }

    private validateInternal(modes: readonly OutcomeLibraryBundleModeInput<T>[]): ValidationIssue[] {
        const issues: ValidationIssue[] = [];

        if (modes.length === 0) {
            issues.push({
                code: "outcome-library-bundle-write-modes-empty",
                severity: "error",
                message: "Writing an outcome library bundle requires at least one mode.",
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

            this.validateModeName(mode.modeName, position, seenNames, issues);

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
                    code: "outcome-library-bundle-cross-mode-provenance-mismatch",
                    severity: "error",
                    message: `mode "${mode.modeName}" has different provenance (game id/version, configHash, or pokieVersion) than the bundle's other modes.`,
                    details: {modeName: mode.modeName},
                });
            }
        });

        return issues;
    }

    private validateModeName(modeName: string, position: number, seenNames: Map<string, string>, issues: ValidationIssue[]): void {
        if (typeof modeName !== "string" || !(/^[A-Za-z0-9_-]+$/).test(modeName)) {
            issues.push({
                code: "outcome-library-bundle-mode-name-invalid",
                severity: "error",
                message: `mode at position ${position} has an invalid modeName (${JSON.stringify(modeName)}); must be a non-empty string matching [A-Za-z0-9_-]+.`,
                details: {position, modeName},
            });
            return;
        }

        const lowerName = modeName.toLowerCase();
        const existing = seenNames.get(lowerName);
        if (existing === undefined) {
            seenNames.set(lowerName, modeName);
            return;
        }

        if (existing === modeName) {
            issues.push({
                code: "outcome-library-bundle-duplicate-mode-name",
                severity: "error",
                message: `modeName "${modeName}" is used by more than one mode.`,
                details: {modeName},
            });
        } else {
            issues.push({
                code: "outcome-library-bundle-mode-name-case-collision",
                severity: "error",
                message: `modeName "${modeName}" differs only in case from modeName "${existing}"; these would write the same files ("index_${modeName}.json"/"outcomes_${modeName}.jsonl") on a case-insensitive filesystem, so the write is refused rather than risk one mode silently overwriting the other's output.`,
                details: {modeName, collidesWith: existing},
            });
        }
    }
}
