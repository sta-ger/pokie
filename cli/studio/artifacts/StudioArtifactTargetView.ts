import type {ArtifactTargetType} from "pokie";

// GET /api/project/artifacts/targets' own DTO -- one entry per ArtifactBuilderRegistry.listTargets(),
// with `supported` already resolved against the active project's own ProjectType (see
// StudioArtifactBuildService.listTargets). ExportDeployTab uses this server-resolved flag to enable only
// buildable cards and to explain why unavailable cards cannot run, rather than re-deriving its own
// ProjectType/capability rule -- see ExportDeployTargets.ts's own doc comment for why that duplication is
// exactly what this endpoint exists to remove.
export type StudioArtifactTargetView = {
    readonly target: ArtifactTargetType;
    readonly supported: boolean;
    readonly unsupportedNotes: readonly string[];
};
