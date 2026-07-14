import type {ReelStripGenerationDiagnostic} from "../reels/ReelStripGenerationDiagnostic.js";
import type {ReelStripGenerationSpec} from "./ReelStripGenerationSpec.js";

// The outcome of generating one reel's strip via ReelStripGenerator at build time -- recorded in
// build-info.json (see GameBuildInfo.reelStripGeneration) for provenance, and used by "pokie build"
// to report a clear failure when a reel's constraints turn out to be unsatisfiable. Only reels whose
// GameBlueprint.reelStripGeneration[reelIndex] was "generated" (not "literal") get an entry here.
export type ReelStripGenerationSummary = {
    reelIndex: number;
    // The exact authored spec that drove this reel's generation (including its own seed) --
    // preserved verbatim for provenance, independent of whether generation succeeded. Always the
    // "generated" branch of ReelStripGenerationSpec, since "literal" reels never get a summary.
    config: Extract<ReelStripGenerationSpec, {type: "generated"}>;
    seed: number;
    success: boolean;
    attemptsUsed: number;
    diagnostics: ReelStripGenerationDiagnostic[];
    // The resulting exact strip, present if and only if success is true.
    strip?: string[];
};
