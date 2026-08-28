import type {OutcomeLibraryBundleModeInput} from "./OutcomeLibraryBundleModeInput.js";
import type {OutcomeLibraryBundleWriteResult} from "./OutcomeLibraryBundleWriteResult.js";

// Lifecycle hooks intentionally live with the writer rather than in project/, because direct bundle users
// need the same ability to observe and stop a long streaming publish as ArtifactBuilder users do.
export type OutcomeLibraryBundleWriteProgress = {
    readonly completed: bigint;
    readonly message: string;
};

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
    readonly onProgress?: (progress: OutcomeLibraryBundleWriteProgress) => void;
    readonly supplementalFiles?: readonly OutcomeLibraryBundleSupplementalFile[];
    readonly generatedBy?: string;
};

export class OutcomeLibraryBundleWriteCancelledError extends Error {
    constructor() {
        super("Outcome library bundle write was cancelled.");
        this.name = "OutcomeLibraryBundleWriteCancelledError";
    }
}

export interface OutcomeLibraryBundleWriting<T extends string | number = string> {
    writeToDirectory(
        modes: readonly OutcomeLibraryBundleModeInput<T>[],
        outDir: string,
        options?: OutcomeLibraryBundleWriteOptions,
    ): Promise<OutcomeLibraryBundleWriteResult>;
}
