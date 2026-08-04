import type {ValidationIssue} from "pokie";

// POST /api/home/blueprints/shared-weights-conversion's own DTO -- backs the Game Model view's own
// "Convert to editable per-reel strips" action for a "symbolWeights"/"default" blueprint (see
// GameModelView.tsx's SharedWeightsConversionTable). Reuses the real core
// convertSharedWeightsToReelStrips() (src/project/buildGameModelReels.ts) -- the exact same weights ->
// sample math the read-only Game Model view already renders -- so `reelStrips` here is byte-for-byte the
// same reproducible sample the user was just shown, never a second, independently re-derived conversion.
// Purely a compute-and-return step, same "never writes anything" contract as
// StudioReelStripGenerationView/StudioBlueprintRandomView -- persisting the result is a separate,
// caller-driven POST /api/project/blueprint/apply call against the caller's own already-loaded
// expectedHash.
export type StudioSharedWeightsConversionView =
    | {status: "ok"; reelStrips: string[][]}
    | {status: "unsupported"; error: string}
    | {status: "invalid"; errors: ValidationIssue[]; warnings: ValidationIssue[]};
