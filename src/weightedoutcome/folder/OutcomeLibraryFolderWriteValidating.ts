import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {OutcomeLibraryFolderModeInput} from "./OutcomeLibraryFolderModeInput.js";

export interface OutcomeLibraryFolderWriteValidating<T extends string | number = string> {
    validate(modes: readonly OutcomeLibraryFolderModeInput<T>[]): ValidationIssue[];
}
