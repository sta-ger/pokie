import type {ReelStripGenerationDiagnostic} from "../reels/ReelStripGenerationDiagnostic.js";

// The outcome of generating one reel's strip via ReelStripGenerator at build time -- recorded in
// build-info.json (see GameBuildInfo.reelStripGeneration) for provenance, and used by "pokie build"
// to report a clear failure when a reel's constraints turn out to be unsatisfiable.
export type ReelStripGenerationSummary = {
    reelIndex: number;
    seed: number;
    success: boolean;
    attemptsUsed: number;
    diagnostics: ReelStripGenerationDiagnostic[];
};
