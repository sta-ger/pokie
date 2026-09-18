import type {ValidationIssue} from "../../validation/ValidationIssue.js";

export type OutcomeLibraryBundleValidateOptions = {
    // Streams every outcomes line per mode and fully rebuilds each mode's library to recompute its hash and
    // analysis — expensive (defeats the whole point of a streaming bundle if run on every load), so it's
    // opt-in. Off by default: only the manifest and each mode's own small index are read.
    readonly deep?: boolean;
    /** Stops a long deep validation at the same safe boundaries as publication. */
    readonly signal?: AbortSignal;
    /** Lets an owning workflow retain its public cancellation error type. */
    readonly throwIfAborted?: () => void;
    /**
     * A deep validation performs several independent record checks.  The
     * counter deliberately measures those checks, rather than claiming that
     * a raw generation total is validation progress.
     */
    readonly onProgress?: (progress: {
        readonly completed: bigint;
        readonly total?: bigint;
        readonly unit: "outcome records checked";
        readonly message: string;
    }) => void;
};

// Not generic over T: unlike OutcomeLibraryBundleReading/Writing, nothing in this method's own signature is
// ever typed by a particular T (it validates a directory path and returns diagnostics, never a typed in-memory
// value) — OutcomeLibraryBundleValidator itself still uses T internally (to rebuild each mode's library with
// the right RoundArtifact<T> type during a deep check), but that's an implementation detail, not part of this
// contract.
export interface OutcomeLibraryBundleValidating {
    validate(bundleDir: string, options?: OutcomeLibraryBundleValidateOptions): Promise<ValidationIssue[]>;
}
