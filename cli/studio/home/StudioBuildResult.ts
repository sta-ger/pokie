import type {GameBlueprintManifest, GameBuildInfo, ValidationIssue} from "pokie";

// POST /api/home/projects/build's own DTO. "load-error"/"invalid" mirror StudioBuildPreviewView's own
// (a failing build never even reaches GamePackageGenerator in those cases); "error" covers
// GamePackageGenerator.generate() itself throwing — most notably its own safe-rebuild/conflict check
// (see GamePackageGenerator.assertSafeToRebuild) refusing to overwrite a directory that already
// contains files a prior "pokie build" didn't generate — surfaced here via its own descriptive message,
// never a stack trace.
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
          unchanged: boolean;
          warnings: ValidationIssue[];
      };
