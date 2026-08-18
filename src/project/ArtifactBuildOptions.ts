// Optional lifecycle hooks for callers that run artifact work from an interactive surface.  They are deliberately
// part of the builder contract rather than a CLI-only wrapper, so Studio and CLI observe/cancel the same work.
export type ArtifactBuildStatus = "preflight" | "running" | "completed" | "cancelled" | "failed";

export type ArtifactBuildPreflight = {
    readonly estimatedItemCount?: bigint;
    readonly estimatedBytes?: bigint;
    readonly complexityWarning?: string;
};

export type ArtifactBuildProgress = {
    readonly status: ArtifactBuildStatus;
    readonly completed?: bigint;
    readonly total?: bigint;
    readonly preflight?: ArtifactBuildPreflight;
};

export type ArtifactBuildOptions = {
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: ArtifactBuildProgress) => void;
};

export class ArtifactBuildCancelledError extends Error {
    constructor() {
        super("Artifact build was cancelled.");
        this.name = "ArtifactBuildCancelledError";
    }
}

export function assertArtifactBuildNotCancelled(options: ArtifactBuildOptions | undefined): void {
    if (options?.signal?.aborted) {
        reportArtifactBuildProgress(options, {status: "cancelled"});
        throw new ArtifactBuildCancelledError();
    }
}

export function reportArtifactBuildProgress(options: ArtifactBuildOptions | undefined, progress: ArtifactBuildProgress): void {
    options?.onProgress?.(progress);
}
