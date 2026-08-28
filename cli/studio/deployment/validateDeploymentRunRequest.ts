import {validateOutcomeLibrarySelector, type OutcomeLibrarySelectorInput} from "../outcomeLibrary/validateOutcomeLibrarySelector.js";
import type {StudioDeploymentModeInput} from "./StudioDeploymentModeInput.js";

export type DeploymentRunRequestInput = {
    targetId?: unknown;
    modes?: unknown;
    publish?: unknown;
};

export type ValidatedDeploymentRunRequest = {
    readonly targetId: string;
    readonly modes: readonly StudioDeploymentModeInput[];
    readonly publish: boolean;
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// The one place a POST /api/project/deployment/runs body is turned into a trusted
// ValidatedDeploymentRunRequest — throws a plain, client-safe Error (StudioServer catches this and
// maps it to 400) for anything malformed: a missing/empty targetId, an empty modes array, a mode entry
// with a missing/empty modeName or a malformed librarySelector (see validateOutcomeLibrarySelector,
// shared with the Outcome Libraries tab's own select/compare requests), two modes naming the same mode,
// or a non-boolean publish.  An omitted `modes` is optional for the Build/Export surface:
// in that form the server resolves compatible registered Outcome Libraries for
// the current project.  A non-empty array remains supported for the dedicated
// deployment configuration surface, but it is never required merely to carry
// a browser-held prerequisite selector. Does not check that targetId refers to a real target, or that a librarySelector
// actually resolves to a real, readable, well-formed library — those are StudioDeploymentService's own job
// (404 / structured run-result concerns, not "is this request even shaped right").
export function validateDeploymentRunRequest(input: DeploymentRunRequestInput): ValidatedDeploymentRunRequest {
    const {targetId, modes, publish} = input;

    if (!isNonEmptyString(targetId)) {
        throw new Error('"targetId" must be a non-empty string.');
    }
    if (modes !== undefined && (!Array.isArray(modes) || modes.length === 0)) {
        throw new Error('"modes" must be a non-empty array when given.');
    }
    if (publish !== undefined && typeof publish !== "boolean") {
        throw new Error('"publish" must be a boolean when given.');
    }

    const seenModeNames = new Set<string>();
    const validatedModes: StudioDeploymentModeInput[] = (modes ?? []).map((rawMode: unknown, index: number) => {
        const mode = (rawMode ?? {}) as {modeName?: unknown; librarySelector?: unknown};
        if (!isNonEmptyString(mode.modeName)) {
            throw new Error(`modes[${index}].modeName must be a non-empty string.`);
        }
        if (seenModeNames.has(mode.modeName)) {
            throw new Error(`"${mode.modeName}" was given more than once in "modes" — each mode may only be deployed once per run.`);
        }
        seenModeNames.add(mode.modeName);
        const librarySelector = validateOutcomeLibrarySelector(
            (mode.librarySelector ?? {}) as OutcomeLibrarySelectorInput,
            `modes[${index}].librarySelector`,
        );
        return {modeName: mode.modeName, librarySelector};
    });

    return {targetId, modes: validatedModes, publish: publish ?? false};
}
