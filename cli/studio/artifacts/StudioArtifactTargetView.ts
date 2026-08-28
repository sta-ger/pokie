import type {ArtifactConversionPlan, ArtifactTargetType, BuildProductMatrixCellState} from "pokie";

// GET /api/project/artifacts/targets' own DTO -- one entry per ArtifactBuilderRegistry.listTargets(),
// with `supported` already resolved against the active project's own ProjectType (see
// StudioArtifactBuildService.listTargets). ExportDeployTab uses this server-resolved flag to enable only
// buildable cards and to explain why unavailable cards cannot run, rather than re-deriving its own
// ProjectType/capability rule -- see ExportDeployTargets.ts's own doc comment for why that duplication is
// exactly what this endpoint exists to remove.
export type StudioArtifactTargetView = {
    readonly target: ArtifactTargetType;
    readonly supported: boolean;
    readonly state: BuildProductMatrixCellState;
    readonly diagnostic?: string;
    // The server's canonical planner payload. The client presents it, but never recreates an edge from
    // source/target labels or an old matrix row.
    readonly plan: ArtifactConversionPlan;
    readonly unsupportedNotes: readonly string[];
};
