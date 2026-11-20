import type {ValidationIssue} from "../validation/ValidationIssue.js";
import type {CertificationPackIndex} from "./CertificationPackIndex.js";
import type {PublishedDirectoryOwnership} from "../stakeengine/internal/publishDirectoryAtomically.js";

// The result of CertificationPackBuilding.buildFromBundle. "index" is undefined if and only if
// "issues" contains an error — the same "no partial bundle" guarantee OutcomeLibraryFolderWriteResult/
// StakeEngineExportResult already carry: either every file (each mode's samples, index.json) was written, or
// none was.
export type CertificationPackBuildResult = {
    readonly outDir: string;
    /** SHA-256 of exact published bytes; content identity is separate and deterministic. */
    readonly fileHashes?: Readonly<Record<string, string>>;
    readonly files: readonly string[];
    readonly index: CertificationPackIndex | undefined;
    readonly issues: readonly ValidationIssue[];
    /** Present only when this invocation atomically installed outDir. */
    readonly publication?: PublishedDirectoryOwnership;
};
