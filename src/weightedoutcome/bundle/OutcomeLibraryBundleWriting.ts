import type {OutcomeLibraryBundleModeInput} from "./OutcomeLibraryBundleModeInput.js";
import type {OutcomeLibraryBundleWriteResult} from "./OutcomeLibraryBundleWriteResult.js";

// Lifecycle hooks intentionally live with the writer rather than in project/, because direct bundle users
// need the same ability to observe and stop a long streaming publish as ArtifactBuilder users do.
export type OutcomeLibraryBundleWriteProgress = {
    readonly completed: bigint;
    readonly message: string;
};

// Optional companion files published atomically with a canonical bundle, but deliberately not listed in the
// bundle manifest. This is for a producer's own recovery metadata (for example, Stake import's re-export
// descriptor), never for a second outcome-library format: readers continue to rely only on manifest.json and
// its exact inventory.
export type OutcomeLibraryBundleAdditionalFile = {
    readonly relativePath: string;
    readonly contents: string;
};

export type OutcomeLibraryBundleWriteOptions = {
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: OutcomeLibraryBundleWriteProgress) => void;
    readonly additionalFiles?: readonly OutcomeLibraryBundleAdditionalFile[];
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
