import type {OutcomeLibrarySelector} from "./OutcomeLibrarySelector.js";
import {validateOutcomeLibrarySelector, type OutcomeLibrarySelectorInput} from "./validateOutcomeLibrarySelector.js";

export type OutcomeLibraryCompareRequestInput = {left?: unknown; right?: unknown; expectedLeftHash?: unknown};
export type ValidatedOutcomeLibraryCompareRequest = {
    readonly left: OutcomeLibrarySelector;
    readonly right: OutcomeLibrarySelector;
    readonly expectedLeftHash?: string;
};

export function validateOutcomeLibraryCompareRequest(input: OutcomeLibraryCompareRequestInput): ValidatedOutcomeLibraryCompareRequest {
    if (input.expectedLeftHash !== undefined && typeof input.expectedLeftHash !== "string") {
        throw new Error('"expectedLeftHash" must be a string when given.');
    }
    return {
        left: validateOutcomeLibrarySelector((input.left ?? {}) as OutcomeLibrarySelectorInput, "left"),
        right: validateOutcomeLibrarySelector((input.right ?? {}) as OutcomeLibrarySelectorInput, "right"),
        expectedLeftHash: input.expectedLeftHash,
    };
}
