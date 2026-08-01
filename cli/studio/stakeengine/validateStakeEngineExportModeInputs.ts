import {validateOutcomeLibrarySelector, type OutcomeLibrarySelectorInput} from "../outcomeLibrary/validateOutcomeLibrarySelector.js";
import type {StudioStakeEngineExportModeInput} from "./StudioStakeEngineExportModeInput.js";

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// Shape/type checks only — never the domain-level mode-name/cost/representability validation
// StakeEngineExportValidator itself already performs (and reports as ValidationIssues); this only guards
// against a request too malformed to even attempt. Shared by both the Validate and Export request
// validators (see validateStakeEngineExportValidateRequest.ts/validateStakeEngineExportRequest.ts) so the
// two can never disagree on what counts as a well-formed mode row. "librarySelector" is validated the same
// way (and against the same shared shape) as a Deployment mode's own librarySelector — see
// validateOutcomeLibrarySelector.
export function validateStakeEngineExportModeInputs(modes: unknown): StudioStakeEngineExportModeInput[] {
    if (!Array.isArray(modes) || modes.length === 0) {
        throw new Error('"modes" must be a non-empty array.');
    }

    return modes.map((entry, position) => {
        const mode = (entry ?? {}) as {modeName?: unknown; librarySelector?: unknown; cost?: unknown};
        if (!isNonEmptyString(mode.modeName)) {
            throw new Error(`modes[${position}].modeName must be a non-empty string.`);
        }
        const librarySelector = validateOutcomeLibrarySelector((mode.librarySelector ?? {}) as OutcomeLibrarySelectorInput, `modes[${position}].librarySelector`);
        if (typeof mode.cost !== "number") {
            throw new Error(`modes[${position}].cost must be a number.`);
        }
        return {modeName: mode.modeName, librarySelector, cost: mode.cost};
    });
}
