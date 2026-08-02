import type {GameBlueprintManifest, GameBuildInfo, ValidationIssue} from "pokie";

// POST /api/home/projects/build's own DTO. "load-error"/"invalid" mirror StudioBuildPreviewView's own
// (a failing build never even reaches GamePackageGenerator in those cases); "error" covers
// GamePackageGenerator.generate() itself throwing — most notably its own missing-or-empty-directory
// check refusing to build into a destination that already has content — surfaced here via its own
// descriptive message, never a stack trace. "buildInfo" is computed purely for this response (via
// buildGameBuildInfo) — it's never persisted into the built package itself.
export type StudioBuildResult =
    | {status: "load-error"; error: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "error"; error: string}
    | {
          status: "ok";
          projectRoot: string;
          manifest: GameBlueprintManifest;
          createdFiles: string[];
          buildInfo: GameBuildInfo;
          warnings: ValidationIssue[];
      };
