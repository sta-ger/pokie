import type {OutcomeLibrarySelector} from "./OutcomeLibrarySelector.js";
import {validateOutcomeLibrarySelector, type OutcomeLibrarySelectorInput} from "./validateOutcomeLibrarySelector.js";

export type OutcomeLibrarySelectRequestInput = {selector?: unknown};
export type ValidatedOutcomeLibrarySelectRequest = {readonly selector: OutcomeLibrarySelector};

export function validateOutcomeLibrarySelectRequest(input: OutcomeLibrarySelectRequestInput): ValidatedOutcomeLibrarySelectRequest {
    return {selector: validateOutcomeLibrarySelector((input.selector ?? {}) as OutcomeLibrarySelectorInput, "selector")};
}
