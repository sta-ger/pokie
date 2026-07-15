import type {ValidationIssue} from "../../validation/ValidationIssue.js";
import type {OutcomeLibraryBundleManifest} from "./OutcomeLibraryBundleManifest.js";

// The result of OutcomeLibraryBundleWriting.writeToDirectory. "manifest" is undefined if and only if "issues"
// contains an error — the same "no partial bundle" guarantee as StakeEngineExportResult: either every file
// (each mode's index/outcomes, manifest.json) was written, or none was.
export type OutcomeLibraryBundleWriteResult = {
    readonly outDir: string;
    readonly files: readonly string[];
    readonly manifest: OutcomeLibraryBundleManifest | undefined;
    readonly issues: readonly ValidationIssue[];
};
