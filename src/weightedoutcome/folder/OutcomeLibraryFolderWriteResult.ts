import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {PublishedDirectoryOwnership} from "../../stakeengine/internal/publishDirectoryAtomically.js";
import type {OutcomeLibraryFolderIndex} from "./OutcomeLibraryFolderIndex.js";

// The result of OutcomeLibraryFolderWriting.writeToDirectory. "manifest" is undefined if and only if "issues"
// contains an error — the same "no partial bundle" guarantee as StakeEngineExportResult: either every file
// (each mode's index/outcomes, index.json) was written, or none was.
export type OutcomeLibraryFolderWriteResult = {
    readonly outDir: string;
    readonly files: readonly string[];
    readonly manifest: OutcomeLibraryFolderIndex | undefined;
    readonly issues: readonly ValidationIssue[];
    /** Present only when this invocation atomically installed outDir. */
    readonly publication?: PublishedDirectoryOwnership;
};
