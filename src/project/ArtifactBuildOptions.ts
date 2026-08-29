import fs from "fs";
import path from "path";

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
    // A human-readable phase is intentionally optional: existing callers can continue to render the stable
    // status enum, while interactive callers can show what a long running writer is currently doing.
    readonly message?: string;
};

export type ArtifactBuildOptions = {
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: ArtifactBuildProgress) => void;
    // Only meaningful while converting a runnable Blueprint/tsPackage into an Outcome Library.  Keeping
    // this on the registry-owned lifecycle options lets CLI and other callers select a direct sampled
    // generation without growing a parallel, CLI-only conversion path.
    readonly outcomeLibraryGeneration?:
        // An explicit exact request suppresses the managed workflow's safe default bounded-coverage
        // selection for a large raw reel-stop space.
        | {readonly exact: true; readonly sampled?: never; readonly maxExactOutcomeSpaceSize?: bigint; readonly compatibilityPolicyVersion?: string}
        | {readonly exact?: never; readonly sampled: {readonly sampleSize: bigint; readonly seed: string}; readonly maxExactOutcomeSpaceSize?: bigint; readonly compatibilityPolicyVersion?: string};
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

// Builders delegate to several independently injectable writers.  Those writers are normally atomic themselves,
// but this guard also protects callers from a custom writer that throws after creating its target.  It removes only
// work that this invocation could have created; an empty directory supplied by a caller is retained as empty.
export type ArtifactDestinationState = {readonly existed: boolean; readonly kind: "file" | "directory"};

export function captureArtifactDestinationState(destinationPath: string, kind: "file" | "directory"): ArtifactDestinationState {
    return {existed: fs.existsSync(destinationPath), kind};
}

// A file artifact may have a nested explicit destination whose parent has not
// been created yet. Builders must create that parent before allocating their
// adjacent staging files; doing it here keeps the direct-builder and
// registry-owned PAR publication lifecycles on the same safe contract. The
// parent is deliberately not removed during rollback: it may have existed
// before this operation (including through a concurrent creator), while the
// publication cleanup below is limited to operation-owned artifacts.
export async function ensureArtifactDestinationParent(destinationPath: string): Promise<void> {
    await fs.promises.mkdir(path.dirname(destinationPath), {recursive: true});
}

export async function cleanupIncompleteArtifactOutput(destinationPath: string, state: ArtifactDestinationState): Promise<void> {
    try {
        if (!state.existed) {
            await fs.promises.rm(destinationPath, {recursive: true, force: true});
        } else if (state.kind === "directory" && fs.existsSync(destinationPath)) {
            await Promise.all((await fs.promises.readdir(destinationPath)).map((entry) => fs.promises.rm(path.join(destinationPath, entry), {recursive: true, force: true})));
        }
    } catch {
        // Preserve the original build error. Atomic writers already make this a best-effort last line of defence.
    }
}
