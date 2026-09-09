import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {StakeEngineManifest} from "./StakeEngineManifest.js";
import type {PublishedDirectoryOwnership} from "./internal/publishDirectoryAtomically.js";

// The result of StakeEngineExporter.exportToDirectory. "files" is [] and "manifest" is undefined if and only if
// "issues" contains an error — mirroring ParSheetExporter's "no partial export" guarantee: either every file
// (per-mode CSV/books, index.json, pokie-manifest.json) was written, or none was.
export type StakeEngineExportResult = {
    readonly outDir: string;
    readonly files: readonly string[];
    readonly manifest: StakeEngineManifest | undefined;
    readonly issues: readonly ValidationIssue[];
    /** Present only when this invocation atomically installed outDir. */
    readonly publication?: PublishedDirectoryOwnership;
};
