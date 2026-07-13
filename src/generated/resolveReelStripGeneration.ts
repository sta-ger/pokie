import type {ReelStripConstraint} from "../reels/ReelStripConstraint.js";
import {ReelStripGenerator} from "../reels/ReelStripGenerator.js";
import {createReelStripConstraintFromSpec} from "./createReelStripConstraintFromSpec.js";
import type {GameBlueprint} from "./GameBlueprint.js";
import type {GameBuildInfoReelStripGeneration} from "./GameBuildInfoReelStripGeneration.js";
import type {ReelStripGenerationSummary} from "./ReelStripGenerationSummary.js";

export type ReelStripGenerationResolution =
    | {success: true; reelStripGeneration?: GameBuildInfoReelStripGeneration}
    | {success: false; reels: ReelStripGenerationSummary[]};

// Runs every "generated" entry of blueprint.reelStripGeneration (if present) through the existing
// ReelStripGenerator, independently per reel — each reel has its own length/symbolCounts-or-
// symbolWeights/seed/constraints, entirely unrelated to any other reel's. "literal" entries are left
// alone entirely (nothing to generate, nothing to record). When reelStripGeneration is absent, this
// is a no-op success with no buildInfo — old blueprints with literal reelStrips (or neither field)
// never call into this at all in practice, but it's harmless either way.
//
// Deterministic by construction: each "generated" entry supplies its own seed, and
// ReelStripGenerator itself is already deterministic for a given seed — so re-running "pokie build"
// on an unchanged blueprint always reproduces the same exact strips for every generated reel.
export function resolveReelStripGeneration(
    blueprint: GameBlueprint,
    generator: ReelStripGenerator = new ReelStripGenerator(),
): ReelStripGenerationResolution {
    const specs = blueprint.reelStripGeneration;
    if (specs === undefined) {
        return {success: true};
    }

    const reels: ReelStripGenerationSummary[] = [];
    let allSucceeded = true;

    specs.forEach((spec, reelIndex) => {
        if (spec.type === "literal") {
            return;
        }

        let constraints: ReelStripConstraint[];
        try {
            constraints = (spec.constraints ?? []).map(createReelStripConstraintFromSpec);
        } catch (error) {
            allSucceeded = false;
            reels.push({
                reelIndex,
                config: spec,
                seed: spec.seed,
                success: false,
                attemptsUsed: 0,
                diagnostics: [
                    {
                        attempt: 0,
                        accepted: false,
                        violations: [
                            {
                                constraintId: "reelStripGeneration.constraints",
                                message: `Could not build reelStripGeneration[${reelIndex}].constraints: ${
                                    error instanceof Error ? error.message : String(error)
                                }`,
                            },
                        ],
                    },
                ],
            });
            return;
        }

        const baseRequest = {
            length: spec.length,
            seed: spec.seed,
            lockedPositions: spec.lockedPositions,
            constraints,
            maxAttempts: spec.maxAttempts,
        };

        const result =
            spec.symbolCounts !== undefined
                ? generator.generate({...baseRequest, symbolCounts: spec.symbolCounts})
                : generator.generateFromSymbolWeights({
                    ...baseRequest,
                    symbolWeights: spec.symbolWeights ?? {},
                    roundingPolicy: spec.roundingPolicy,
                    remainderTieBreakPolicy: spec.remainderTieBreakPolicy,
                });

        if (!result.success) {
            allSucceeded = false;
        }
        reels.push({
            reelIndex,
            config: spec,
            seed: spec.seed,
            success: result.success,
            attemptsUsed: result.attemptsUsed,
            diagnostics: result.diagnostics,
            ...(result.success ? {strip: result.strip!.toArray()} : {}),
        });
    });

    if (!allSucceeded) {
        return {success: false, reels};
    }
    if (reels.length === 0) {
        return {success: true};
    }
    return {success: true, reelStripGeneration: {reels}};
}
