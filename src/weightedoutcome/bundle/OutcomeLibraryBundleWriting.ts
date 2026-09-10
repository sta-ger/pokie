import type {OutcomeLibraryBundleModeInput} from "./OutcomeLibraryBundleModeInput.js";
import type {OutcomeLibraryBundleWriteResult} from "./OutcomeLibraryBundleWriteResult.js";

// Lifecycle hooks intentionally live with the writer rather than in project/, because direct bundle users
// need the same ability to observe and stop a long streaming publish as ArtifactBuilder users do.
export type OutcomeLibraryBundleWriteProgress = {
    readonly completed: bigint;
    readonly message: string;
};

// These are observable boundaries after a streaming producer has started: they deliberately do
// not pretend that a raw-combination percentage is the whole job. Studio uses them to distinguish
// completed enumeration from the remaining finalization, serialization, validation and atomic swap.
export type OutcomeLibraryBundleWriteLifecycleStage = "finalization" | "serialization" | "validation" | "publication";

// A caller may keep a small, non-bundle companion document beside a canonical bundle (for example,
// a deployment descriptor that refers back to this bundle). These files are intentionally excluded
// from manifest.files: that inventory remains the exact canonical bundle contract validated by
// OutcomeLibraryBundleValidator.
export type OutcomeLibraryBundleSupplementalFile = {
    readonly fileName: string;
    readonly contents: string;
};

export type OutcomeLibraryBundleWriteOptions = {
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
    readonly onProgress?: (progress: OutcomeLibraryBundleWriteProgress) => void;
    readonly onLifecycleStage?: (stage: OutcomeLibraryBundleWriteLifecycleStage) => void;
    readonly supplementalFiles?: readonly OutcomeLibraryBundleSupplementalFile[];
    readonly generatedBy?: string;
};

export class OutcomeLibraryBundleWriteCancelledError extends Error {
    constructor() {
        super("Outcome library bundle write was cancelled.");
        this.name = "OutcomeLibraryBundleWriteCancelledError";
    }
}

// A physical destination appeared or changed after the writer's final
// source-aware policy accepted it. Consumers with generic rollback use this
// to avoid deleting that other owner's directory.
export class OutcomeLibraryBundleDestinationClaimedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "OutcomeLibraryBundleDestinationClaimedError";
    }
}

export interface OutcomeLibraryBundleWriting<T extends string | number = string> {
    writeToDirectory(
        modes: readonly OutcomeLibraryBundleModeInput<T>[],
        outDir: string,
        options?: OutcomeLibraryBundleWriteOptions,
    ): Promise<OutcomeLibraryBundleWriteResult>;
}
