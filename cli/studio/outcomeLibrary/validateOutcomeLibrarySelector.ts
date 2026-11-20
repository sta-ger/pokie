import type {OutcomeLibrarySelector} from "./OutcomeLibrarySelector.js";

export type OutcomeLibrarySelectorInput = {
    kind?: unknown;
    path?: unknown;
    libraryDir?: unknown;
    modeName?: unknown;
    stakeDir?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
    return typeof value === "string" && value.trim().length > 0;
}

// Shared by every request that carries an outcome-library selector (select, compare's left/right) -- turns
// a request body's own selector object into a trusted OutcomeLibrarySelector, throwing a plain, client-safe
// Error (StudioServer maps this to 400) for anything malformed. Never checks that the path/directory
// actually exists or contains a well-formed library -- that is loadOutcomeLibraryFromSelector's own job (a
// "load-error" result, not a 400).
export function validateOutcomeLibrarySelector(input: OutcomeLibrarySelectorInput, field: string): OutcomeLibrarySelector {
    if (input.kind === "json") {
        if (!isNonEmptyString(input.path)) {
            throw new Error(`"${field}.path" must be a non-empty string.`);
        }
        return {kind: "json", path: input.path};
    }
    if (input.kind === "folder") {
        if (!isNonEmptyString(input.libraryDir)) {
            throw new Error(`"${field}.libraryDir" must be a non-empty string.`);
        }
        if (!isNonEmptyString(input.modeName)) {
            throw new Error(`"${field}.modeName" must be a non-empty string.`);
        }
        return {kind: "folder", libraryDir: input.libraryDir, modeName: input.modeName};
    }
    if (input.kind === "stakeengine") {
        if (!isNonEmptyString(input.stakeDir)) {
            throw new Error(`"${field}.stakeDir" must be a non-empty string.`);
        }
        if (!isNonEmptyString(input.modeName)) {
            throw new Error(`"${field}.modeName" must be a non-empty string.`);
        }
        return {kind: "stakeengine", stakeDir: input.stakeDir, modeName: input.modeName};
    }
    throw new Error(`"${field}.kind" must be one of "json", "folder", "stakeengine".`);
}
