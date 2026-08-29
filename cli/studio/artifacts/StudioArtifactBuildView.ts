import type {ArtifactConversionPlan, ArtifactTargetType, ProjectType, StakeEngineManifest} from "pokie";

// POST /api/project/artifacts/build's own DTO -- mirrors ArtifactBuilderRegistry.build()'s own outcomes
// exactly, the same ones "pokie build <project> --target <target>" itself can hit: a successful build's
// outputPath/sourceType, an unsupported conversion (the same capability diagnostic
// registry.supportsConversionFrom() reports at listTargets() time, re-checked here), a destination
// conflict (ArtifactBuildConflictError -- an existing, non-empty destination), or any other build failure
// (e.g. an invalid blueprint for a "tsPackage" build).
export type StudioArtifactBuildView =
    | {
          readonly status: "ok";
          readonly target: ArtifactTargetType;
          readonly outputPath: string;
          readonly outputKind: "file" | "directory";
          readonly sourceType: ProjectType;
          // The exact server-selected executable plan, retained with the
          // result so the browser never infers reuse or prerequisites.
          readonly plan: ArtifactConversionPlan;
          readonly requestedDestinationPath?: string;
          readonly reusedCompatibleProject?: boolean;
          /** Durable PAR import records, when this artifact was derived from a workbook. */
          readonly importedBlueprintPath?: string;
          readonly conversionEvidencePath?: string;
          readonly preflight?: {readonly estimatedItemCount?: string; readonly estimatedBytes?: string; readonly complexityWarning?: string};
          /** Exact Stake publication evidence for the goal-oriented Stake card. */
          readonly stakeManifest?: StakeEngineManifest;
          readonly stakeFiles?: readonly string[];
          /** Compatibility and ownership facts for the prerequisite selected at preflight. */
          readonly stakePrerequisiteProvenance?: {
              readonly route: "reuse" | "generate" | "publish";
              readonly selectedPrerequisiteLocation?: string;
              readonly disposition: "borrowed" | "owned" | "transient" | "none";
              readonly sourceGameId?: string;
              readonly sourceGameVersion?: string;
              readonly sourceConfigurationHash?: string;
              readonly sourcePokieVersion?: string;
              readonly generationSemantics?: "exact" | "boundedSample";
              readonly sampleCount?: string;
              readonly sampleSeed?: string;
              readonly maxExactOutcomeSpaceSize?: string;
              readonly compatibilityPolicyVersion?: string;
          };
      }
    | {readonly status: "unsupported"; readonly target: ArtifactTargetType; readonly message: string; readonly plan: ArtifactConversionPlan}
    | {readonly status: "conflict"; readonly target: ArtifactTargetType; readonly message: string; readonly plan: ArtifactConversionPlan}
    // A terminal job must retain the decision it was executing.  In particular,
    // cancellation is not a second, plan-less result protocol: callers need the
    // same provenance/destination/recovery context to decide whether retrying is
    // safe.
    | {readonly status: "cancelled"; readonly message: string; readonly plan: ArtifactConversionPlan}
    | {readonly status: "error"; readonly message: string; readonly plan: ArtifactConversionPlan};
