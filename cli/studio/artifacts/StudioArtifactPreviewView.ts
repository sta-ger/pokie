import type {FormatConversionPlan, OutputFormat, ProjectType} from "@fromstan/pokie";

// POST /api/project/artifacts/preview's own DTO -- the pre-build counterpart to StudioArtifactBuildView
// (see its own doc comment): the exact same registry-resolved target/destination/sourceType a subsequent
// build would use, and the exact same capability/conflict diagnostics build() itself would report --
// computed without ever invoking a builder, so previewing never writes anything and never runs the (often
// expensive) build work itself. There is no "error" status distinct from build()'s own: a preview never
// touches anything a resolve/capability/destination-availability check wouldn't already have to.
export type StudioArtifactPreviewView =
    | {
          readonly status: "ok";
          readonly target: OutputFormat;
          readonly destination: string;
          readonly destinationKind: "file" | "directory";
          readonly plannedOutputs: readonly string[];
          readonly sourceType: ProjectType;
          readonly plan: FormatConversionPlan;
          /** Opaque handle for the retained Stake operation or package extraction plan. */
          readonly preparedOperationId?: string;
          /** Stake information known before publication. */
          readonly stakePreflight?: {
              readonly route: "reuse" | "generate" | "publish";
              readonly selectedPrerequisiteLocation?: string;
              readonly estimatedItemCount?: string;
              readonly estimatedBytes?: string;
              readonly complexityWarning?: string;
              readonly unavailableMetrics?: readonly string[];
              readonly warnings: readonly string[];
          };
      }
    | {readonly status: "unsupported"; readonly target: OutputFormat; readonly message: string; readonly plan: FormatConversionPlan}
    | {
          readonly status: "conflict";
          readonly target: OutputFormat;
          readonly destination: string;
          readonly destinationKind: "file" | "directory";
          readonly plannedOutputs: readonly string[];
          readonly message: string;
          readonly plan: FormatConversionPlan;
      }
    | {readonly status: "error"; readonly message: string; readonly plan: FormatConversionPlan};
