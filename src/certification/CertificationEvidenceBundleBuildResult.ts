import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {CertificationEvidenceBundleManifest} from "./CertificationEvidenceBundleManifest.js";
import type {PublishedDirectoryOwnership} from "../stakeengine/internal/publishDirectoryAtomically.js";

// The result of CertificationEvidenceBundleBuilding.buildFromBundle. "manifest" is undefined if and only if
// "issues" contains an error — the same "no partial bundle" guarantee OutcomeLibraryBundleWriteResult/
// StakeEngineExportResult already carry: either every file (each mode's samples, manifest.json) was written, or
// none was.
export type CertificationEvidenceBundleBuildResult = {
    readonly outDir: string;
    readonly files: readonly string[];
    readonly manifest: CertificationEvidenceBundleManifest | undefined;
    readonly issues: readonly ValidationIssue[];
    /** Present only when this invocation atomically installed outDir. */
    readonly publication?: PublishedDirectoryOwnership;
};
