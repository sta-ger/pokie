import type {OutcomeLibrarySelector} from "./OutcomeLibrarySelector.js";
import {validateOutcomeLibrarySelector, type OutcomeLibrarySelectorInput} from "./validateOutcomeLibrarySelector.js";

export type OutcomeLibraryCompareRequestInput = {left?: unknown; right?: unknown};
export type ValidatedOutcomeLibraryCompareRequest = {readonly left: OutcomeLibrarySelector; readonly right: OutcomeLibrarySelector};

export function validateOutcomeLibraryCompareRequest(input: OutcomeLibraryCompareRequestInput): ValidatedOutcomeLibraryCompareRequest {
    return {
        left: validateOutcomeLibrarySelector((input.left ?? {}) as OutcomeLibrarySelectorInput, "left"),
        right: validateOutcomeLibrarySelector((input.right ?? {}) as OutcomeLibrarySelectorInput, "right"),
    };
}
