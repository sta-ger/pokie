import type {ArtifactBuildProgress, ArtifactTargetType} from "pokie";
import type {StudioArtifactBuildView} from "./StudioArtifactBuildView.js";
import type {StudioJobRecoveryView} from "../jobs/StudioJobView.js";

// A deliberately bounded, pollable representation of one artifact publish.  A job never exposes the
// AbortController or a live builder; callers receive only the latest truthful lifecycle snapshot.
export type StudioArtifactBuildJobView = {
    readonly id: string;
    readonly target: ArtifactTargetType;
    readonly status: "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled" | "recovery-required";
    readonly cancellationRequested: boolean;
    readonly progress?: StudioArtifactBuildProgressView;
    readonly result?: StudioArtifactBuildView;
    readonly error?: string;
    readonly recovery?: StudioJobRecoveryView;
};

export type StudioArtifactBuildProgressView = {
    readonly status: ArtifactBuildProgress["status"];
    readonly completed?: string;
    readonly total?: string;
    readonly preflight?: {readonly estimatedItemCount?: string; readonly estimatedBytes?: string; readonly complexityWarning?: string};
    readonly message?: string;
};
