import type {FormatConversionPlan, OutputFormat, PackageBlueprintExtractionResult, PokieProject, PreparedStakeProjectionOperation} from "@fromstan/pokie";
import type {StudioOutputPreviewView} from "./StudioOutputPreviewView.js";
import type {StudioOutputFormatView} from "./StudioOutputFormatView.js";

export type StudioPreparedArtifactPreview = {
    readonly view: StudioOutputPreviewView;
    readonly stakeOperation?: PreparedStakeProjectionOperation;
    readonly extraction?: {readonly project: PokieProject; readonly destination: string; readonly plan: FormatConversionPlan};
};

/** Cancellation cannot acknowledge resources whose cleanup did not finish. */
export class StudioBuildCheckCleanupError extends Error {
    public constructor(public readonly cause: unknown) {
        super(`Artifact preflight cleanup failed: ${cause instanceof Error ? cause.message : String(cause)}`);
        this.name = "StudioBuildCheckCleanupError";
    }
}

/** Owns read-only runtime inspection, separately from durable publication jobs. */
export interface StudioBuildChecking {
    extractPackage(projectRoot: string, signal?: AbortSignal): Promise<PackageBlueprintExtractionResult>;
    listTargets(projectRoot: string, signal?: AbortSignal): Promise<readonly StudioOutputFormatView[]>;
    preparePreview(projectRoot: string, target: OutputFormat, outDir?: string, signal?: AbortSignal): Promise<StudioPreparedArtifactPreview>;
    cancelForProject(projectRoot: string): Promise<void>;
    cancelAll(): Promise<void>;
}
