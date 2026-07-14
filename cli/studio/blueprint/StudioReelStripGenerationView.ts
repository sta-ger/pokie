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
// reimplemented.
//
// Always "ok": `errors`/`warnings` are the exact same GameBlueprintValidator issues `/validate` would
// report, surfaced *alongside* `reels` rather than blocking them -- a blueprint-level problem unrelated
// to reelStripGeneration itself (a broken paytable, an invalid availableBets, ...) never prevents every
// other, perfectly resolvable reel from being previewed. `reels` is only ever empty when
// reelStripGeneration's own shape is broken (any "blueprint-reelstripgeneration*" error) or the
// blueprint has no reelStripGeneration at all -- see StudioBlueprintService.previewReelStripGeneration's
// own doc comment. A "generated" reel that fails to satisfy its own constraints is likewise reported
// per-reel (its own success: false), not as a top-level failure.
export type StudioReelStripGenerationView = {
    status: "ok";
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
    reels: StudioReelStripGenerationReelView[];
};
