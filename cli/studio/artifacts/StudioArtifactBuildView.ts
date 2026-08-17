import type {ArtifactTargetType, ProjectType} from "pokie";

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
          readonly requestedDestinationPath?: string;
          readonly reusedCompatibleProject?: boolean;
      }
    | {readonly status: "unsupported"; readonly target: ArtifactTargetType; readonly message: string}
    | {readonly status: "conflict"; readonly target: ArtifactTargetType; readonly message: string}
    | {readonly status: "error"; readonly message: string};
