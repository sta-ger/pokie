import type {GameBlueprintManifest, ValidationIssue} from "pokie";

// POST /api/home/projects/build/preview's own DTO — never writes anything to disk (same reasoning as
// BuildCommand's own --dry-run: validate, then compute the same blueprintHash/expected-files preview
// buildGameBuildInfo already produces, purely in memory). "load-error" covers a blueprintPath that
// doesn't exist/doesn't parse as JSON (see loadGameBlueprint); "invalid" covers a well-formed JSON
// object that fails GameBlueprintValidator's own structural checks.
export type StudioBuildPreviewView =
    | {status: "load-error"; error: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {
          status: "ok";
          warnings: ValidationIssue[];
          manifest: GameBlueprintManifest;
          reels: number;
          rows: number;
          symbolsCount: number;
          blueprintHash: string;
          expectedFiles: string[];
      };
