import type {ArtifactConversionPlan, ArtifactTargetType, ProjectType} from "pokie";

// POST /api/project/artifacts/preview's own DTO -- the pre-build counterpart to StudioArtifactBuildView
// (see its own doc comment): the exact same registry-resolved target/destination/sourceType a subsequent
// build would use, and the exact same capability/conflict diagnostics build() itself would report --
// computed without ever invoking a builder, so previewing never writes anything and never runs the (often
// expensive) build work itself. There is no "error" status distinct from build()'s own: a preview never
// touches anything a resolve/capability/destination-availability check wouldn't already have to.
export type StudioArtifactPreviewView =
    | {
          readonly status: "ok";
          readonly target: ArtifactTargetType;
          readonly destination: string;
          readonly destinationKind: "file" | "directory";
          readonly plannedOutputs: readonly string[];
          readonly sourceType: ProjectType;
          readonly plan: ArtifactConversionPlan;
          /** Opaque handle for the exact retained Stake operation. */
          readonly preparedOperationId?: string;
          /** Stake information known before publication. */
          readonly stakePreflight?: {
              readonly estimatedItemCount?: string;
              readonly estimatedBytes?: string;
              readonly warnings: readonly string[];
          };
      }
    | {readonly status: "unsupported"; readonly target: ArtifactTargetType; readonly message: string; readonly plan: ArtifactConversionPlan}
    | {
          readonly status: "conflict";
          readonly target: ArtifactTargetType;
          readonly destination: string;
          readonly destinationKind: "file" | "directory";
          readonly plannedOutputs: readonly string[];
          readonly message: string;
          readonly plan: ArtifactConversionPlan;
      }
    | {readonly status: "error"; readonly message: string; readonly plan: ArtifactConversionPlan};
