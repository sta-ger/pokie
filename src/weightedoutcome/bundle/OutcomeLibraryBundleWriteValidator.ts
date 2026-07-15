import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {OutcomeLibraryBundleModeInput} from "./OutcomeLibraryBundleModeInput.js";
import type {OutcomeLibraryBundleWriteValidating} from "./OutcomeLibraryBundleWriteValidating.js";

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// Validates only what's knowable *before* a mode's own outcomes stream is ever consumed — mode name format/
// duplicates/case-collisions and libraryId shape, all of which depend solely on the OutcomeLibraryBundleModeInput
// entries themselves, never on their "outcomes" source. Everything that genuinely requires seeing outcome data
// (per-outcome id/weight/artifact validity, cross-outcome sortedness/duplicates within a mode, cross-mode
// provenance consistency) happens incrementally, streamed, inside OutcomeLibraryBundleWriter itself (see
// streamModeOutcomesToTempFile) — this validator exists purely as a fast upfront check that never needs to
// touch a stream, so an obviously-broken request (two modes both named "base") fails immediately without
// consuming anything. Never throws.
export class OutcomeLibraryBundleWriteValidator<T extends string | number = string> implements OutcomeLibraryBundleWriteValidating<T> {
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

        modes.forEach((mode, position) => {
            this.validateModeName(mode.modeName, position, seenNames, issues);

            if (!isNonEmptyString(mode.libraryId)) {
                issues.push({
                    code: "outcome-library-bundle-write-library-id-invalid",
                    severity: "error",
                    message: `mode "${String(mode.modeName)}" has an invalid libraryId (${JSON.stringify(mode.libraryId)}); must be a non-empty string.`,
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
