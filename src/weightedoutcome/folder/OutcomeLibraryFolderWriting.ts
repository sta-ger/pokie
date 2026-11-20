import type {OutcomeLibraryFolderModeInput} from "./OutcomeLibraryFolderModeInput.js";
import type {OutcomeLibraryFolderWriteResult} from "./OutcomeLibraryFolderWriteResult.js";
import type {PublishDirectoryAtomicallyOwnership} from "../../stakeengine/internal/publishDirectoryAtomically.js";

// Lifecycle hooks intentionally live with the writer rather than in project/, because direct bundle users
// need the same ability to observe and stop a long streaming publish as BuildOutputBuilder users do.
export type OutcomeLibraryFolderWriteProgress = {
    readonly phase?: string;
    readonly completed: bigint;
    readonly message: string;
    readonly unit?: "outcome records" | "outcome records checked" | "bytes" | "bundle files";
    readonly total?: bigint;
};

// These are observable boundaries after a streaming producer has started: they deliberately do
// not pretend that a raw-combination percentage is the whole job. Studio uses them to distinguish
// completed enumeration from the remaining finalization, serialization, validation and atomic swap.
export type OutcomeLibraryFolderWriteLifecycleStage = "finalization" | "writing" | "analyzing" | "building-index" | "serialization" | "validation" | "publication";

// A caller may keep a small, non-bundle companion document beside a canonical bundle (for example,
// a deployment descriptor that refers back to this bundle). These files are intentionally excluded
// from index.files: that inventory remains the exact canonical bundle contract validated by
// OutcomeLibraryFolderValidator.
export type OutcomeLibraryFolderSupplementalFile = {
    readonly fileName: string;
    readonly contents: string;
};

export type OutcomeLibraryFolderWriteOptions = {
    readonly signal?: AbortSignal;
    // Lifecycle callers which have already bound and verified a destination
    // as available may publish into an empty directory supplied by their
    // caller. The atomic publisher still captures and verifies that
    // directory's identity, so this never authorizes replacing content.
    readonly allowExistingEmptyDestination?: boolean;
    // The producer may run for long enough that a destination which was safe
    // at preflight is claimed before this writer reaches its atomic swap.
    // Invoke the owner's immutable destination policy at that last boundary.
    // The writer turns a successful policy result into a filesystem
    // reservation which it verifies at the actual directory-swap boundary.
    // This remains a compatibility hook for adapters' source-aware policy;
    // it is not itself relied upon as the ownership mechanism.
    readonly assertDestinationAvailable?: () => Promise<void> | void;
    /** Revision captured before retained modes were read; checked at atomic commit. */
    readonly expectedDestinationOwnership?: PublishDirectoryAtomicallyOwnership;
    readonly onProgress?: (progress: OutcomeLibraryFolderWriteProgress) => void;
    readonly onLifecycleStage?: (stage: OutcomeLibraryFolderWriteLifecycleStage) => void;
    /**
     * Optional publication order independent of streaming order. Studio uses
     * this when it consumes a newly generated mode first to preserve lifecycle
     * order while retaining the existing index's stable mode order.
     */
    readonly indexModeOrder?: readonly string[];
    readonly supplementalFiles?: readonly OutcomeLibraryFolderSupplementalFile[];
    readonly generatedBy?: string;
};

export class OutcomeLibraryFolderWriteCancelledError extends Error {
    constructor() {
        super("Outcome library bundle write was cancelled.");
        this.name = "OutcomeLibraryFolderWriteCancelledError";
    }
}

// A physical destination appeared or changed after the writer's final
// source-aware policy accepted it. Consumers with generic rollback use this
// to avoid deleting that other owner's directory.
export class OutcomeLibraryFolderDestinationClaimedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "OutcomeLibraryFolderDestinationClaimedError";
    }
}

export interface OutcomeLibraryFolderWriting<T extends string | number = string> {
    writeToDirectory(
        modes: readonly OutcomeLibraryFolderModeInput<T>[],
        outDir: string,
        options?: OutcomeLibraryFolderWriteOptions,
    ): Promise<OutcomeLibraryFolderWriteResult>;
}
