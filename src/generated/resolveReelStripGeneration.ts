import type {ReelStripConstraint} from "../reels/ReelStripConstraint.js";
import {ReelStripGenerator} from "../reels/ReelStripGenerator.js";
import {createReelStripConstraintFromSpec} from "./createReelStripConstraintFromSpec.js";
import type {GameBlueprint} from "./GameBlueprint.js";
import type {GameBuildInfoReelStripGeneration} from "./GameBuildInfoReelStripGeneration.js";
import type {ReelStripGenerationSummary} from "./ReelStripGenerationSummary.js";

export type ReelStripGenerationResolution =
    | {success: true; blueprint: GameBlueprint; buildInfo?: GameBuildInfoReelStripGeneration}
    | {success: false; reels: ReelStripGenerationSummary[]};

// Runs blueprint.reelStripGeneration (if present) through the existing ReelStripGenerator, once per
// reel, and bakes the resulting exact strips into a materialized copy of the blueprint's own
// reelStrips -- the exact same field a literal-reelStrips blueprint already uses, so
// renderGeneratedGameModule.ts needs zero changes and the runtime game module never touches the
// generation API at all. When reelStripGeneration is absent, returns the blueprint unchanged
// (same reference, no copy), so old blueprints with literal reelStrips are entirely unaffected.
//
// Deterministic by construction: reel N is generated with seed "reelStripGeneration.seed + N" (every
// reel needs a different seed or they'd all come out byte-identical), and ReelStripGenerator itself
// is already deterministic for a given seed -- so re-running "pokie build" on an unchanged blueprint
// always reproduces the same reelStrips.
export function resolveReelStripGeneration(
    blueprint: GameBlueprint,
    generator: ReelStripGenerator = new ReelStripGenerator(),
): ReelStripGenerationResolution {
    const spec = blueprint.reelStripGeneration;
    if (spec === undefined) {
        return {success: true, blueprint};
    }

    let constraints: ReelStripConstraint[];
    try {
        constraints = (spec.constraints ?? []).map(createReelStripConstraintFromSpec);
    } catch (error) {
        return {
            success: false,
            reels: [
                {
                    reelIndex: -1,
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
                                    message: `Could not build reelStripGeneration.constraints: ${
                                        error instanceof Error ? error.message : String(error)
                                    }`,
                                },
                            ],
                        },
                    ],
                },
            ],
        };
    }

    const reels: ReelStripGenerationSummary[] = [];
    const reelStrips: string[][] = [];
    let allSucceeded = true;

    for (let reelIndex = 0; reelIndex < blueprint.reels; reelIndex++) {
        const seed = spec.seed + reelIndex;
        const baseRequest = {
            length: spec.length,
            seed,
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

        reels.push({reelIndex, seed, success: result.success, attemptsUsed: result.attemptsUsed, diagnostics: result.diagnostics});
        if (result.success) {
            reelStrips.push(result.strip!.toArray());
        } else {
            allSucceeded = false;
        }
    }

    if (!allSucceeded) {
        return {success: false, reels};
    }

    const materializedBlueprint: GameBlueprint = {...blueprint, reelStrips};
    Reflect.deleteProperty(materializedBlueprint, "reelStripGeneration");

    return {success: true, blueprint: materializedBlueprint, buildInfo: {config: spec, reels}};
}
