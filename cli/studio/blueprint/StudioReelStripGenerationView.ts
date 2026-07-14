import type {ReelStripAnalysis, ReelStripGenerationDiagnostic, ValidationIssue} from "pokie";

// One reel's own entry in POST /api/home/blueprints/reel-strip-generation-preview's response --
// mirrors that reel's own GameBlueprint.reelStripGeneration[reelIndex] entry: a "literal" reel's exact
// strip is already known outright, while a "generated" reel's strip (and whether it could even be
// produced) only comes from actually running the existing ReelStripGenerator via
// resolveReelStripGeneration -- unsatisfiable constraints surface here as success: false with no
// strip/analysis, exactly like a real "pokie build" would report at build time.
export type StudioReelStripGenerationReelView =
    | {reelIndex: number; type: "literal"; strip: string[]; analysis: ReelStripAnalysis}
    | {
          reelIndex: number;
          type: "generated";
          seed: number;
          success: true;
          attemptsUsed: number;
          diagnostics: ReelStripGenerationDiagnostic[];
          strip: string[];
          analysis: ReelStripAnalysis;
      }
    | {
          reelIndex: number;
          type: "generated";
          seed: number;
          success: false;
          attemptsUsed: number;
          diagnostics: ReelStripGenerationDiagnostic[];
      };

// POST /api/home/blueprints/reel-strip-generation-preview's own DTO -- reuses
// GameBlueprintValidator.validate() for shape errors (see StudioBlueprintService.validate) and the
// existing resolveReelStripGeneration()/ReelStripAnalyzer for everything else; neither is
// reimplemented. "ok" is returned even when one or more generated reels failed to satisfy their
// constraints -- that outcome is reported per-reel (StudioReelStripGenerationReelView's own success
// flag), not as a top-level failure, so the modeler can still show every other reel's result at once.
export type StudioReelStripGenerationView =
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]}
    | {status: "ok"; warnings: ValidationIssue[]; reels: StudioReelStripGenerationReelView[]};
