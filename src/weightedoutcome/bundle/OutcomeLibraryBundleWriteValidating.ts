import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {OutcomeLibraryBundleModeInput} from "./OutcomeLibraryBundleModeInput.js";

export interface OutcomeLibraryBundleWriteValidating<T extends string | number = string> {
    validate(modes: readonly OutcomeLibraryBundleModeInput<T>[]): ValidationIssue[];
}
