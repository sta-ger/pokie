import type {ReelStripSymbolWeightsRemainderTieBreakPolicy} from "../reels/ReelStripSymbolWeightsRemainderTieBreakPolicy.js";
import type {ReelStripSymbolWeightsRoundingPolicy} from "../reels/ReelStripSymbolWeightsRoundingPolicy.js";
import type {ReelStripConstraintSpec} from "./ReelStripConstraintSpec.js";

// Build-time alternative to a literal GameBlueprint.reelStrips: instead of authoring each reel's
// exact symbol sequence by hand, "pokie build" runs the existing ReelStripGenerator (see
// resolveReelStripGeneration.ts) once per reel and bakes the resulting exact strips into the
// generated package's reelStrips — the runtime game module never depends on the generation API at
// all (see renderGeneratedGameModule.ts, which only ever sees a plain reelStrips array either way).
//
// Applied identically to every reel (same length/symbolCounts-or-symbolWeights/constraints), except
// the seed: reel N uses "seed + N", so reels are varied but every rebuild of an unchanged blueprint
// reproduces byte-identical strips (see resolveReelStripGeneration.ts).
export type ReelStripGenerationBlueprint = {
    length: number;
    // Exactly one of these two must be set -- mirrors ReelStripGenerator's own generate() vs.
    // generateFromSymbolWeights() split.
    symbolCounts?: Record<string, number>;
    symbolWeights?: Record<string, number>;
    // Required (not optional, unlike ReelStripGenerationRequest.seed): build-time generation must be
    // reproducible, so there's no "non-deterministic by default" mode here.
    seed: number;
    roundingPolicy?: ReelStripSymbolWeightsRoundingPolicy;
    remainderTieBreakPolicy?: ReelStripSymbolWeightsRemainderTieBreakPolicy;
    lockedPositions?: Record<number, string>;
    constraints?: ReelStripConstraintSpec[];
    maxAttempts?: number;
};
