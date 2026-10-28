import type {ArtifactConversionPlan, ArtifactTargetType, PackageBlueprintExtractionResult, PokieProject, PreparedStakeProjectionOperation} from "@fromstan/pokie";
import type {StudioArtifactPreviewView} from "./StudioArtifactPreviewView.js";
import type {StudioArtifactTargetView} from "./StudioArtifactTargetView.js";

export type StudioPreparedArtifactPreview = {
    readonly view: StudioArtifactPreviewView;
    readonly stakeOperation?: PreparedStakeProjectionOperation;
    readonly extraction?: {readonly project: PokieProject; readonly destination: string; readonly plan: ArtifactConversionPlan};
};

/** Owns read-only runtime inspection, separately from durable publication jobs. */
export interface StudioArtifactPreflighting {
    extractPackage(projectRoot: string, signal?: AbortSignal): Promise<PackageBlueprintExtractionResult>;
    listTargets(projectRoot: string, signal?: AbortSignal): Promise<readonly StudioArtifactTargetView[]>;
    preparePreview(projectRoot: string, target: ArtifactTargetType, outDir?: string, signal?: AbortSignal): Promise<StudioPreparedArtifactPreview>;
    cancelForProject(projectRoot: string): void;
    cancelAll(): Promise<void>;
}
