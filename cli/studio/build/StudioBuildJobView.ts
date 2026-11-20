import type {BuildProgress, OutputFormat} from "@fromstan/pokie";
import type {StudioBuildView} from "./StudioBuildView.js";
import type {StudioJobRecoveryView} from "../jobs/StudioJobView.js";

// A deliberately bounded, pollable representation of one artifact publish.  A job never exposes the
// AbortController or a live builder; callers receive only the latest truthful lifecycle snapshot.
export type StudioBuildJobView = {
    readonly id: string;
    readonly target: OutputFormat;
    readonly status: "queued" | "running" | "cancelling" | "completed" | "failed" | "cancelled" | "recovery-required";
    readonly cancellationRequested: boolean;
    readonly progress?: StudioBuildProgressView;
    readonly result?: StudioBuildView;
    readonly error?: string;
    readonly recovery?: StudioJobRecoveryView;
};

export type StudioBuildProgressView = {
    readonly status: BuildProgress["status"];
    readonly phase?: string;
    readonly unit?: string;
    readonly completed?: string;
    readonly total?: string;
    readonly preflight?: {readonly estimatedItemCount?: string; readonly estimatedBytes?: string; readonly complexityWarning?: string};
    readonly message?: string;
};
