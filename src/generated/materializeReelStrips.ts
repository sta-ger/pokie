import type {GameBlueprint} from "./GameBlueprint.js";
import type {GameBuildInfoReelStripGeneration} from "./GameBuildInfoReelStripGeneration.js";

// Derives the plain, literal reelStrips a blueprint's per-reel reelStripGeneration resolves to, for
// embedding in the generated runtime module — never re-runs generation itself, just combines each
// reel's already-known content: a "literal" entry's own strip, or a "generated" entry's already-
// computed result (resolveReelStripGeneration's summaries, matched by reelIndex). Requires every
// "generated" entry to have a successful summary with a strip — only ever call this after
// resolveReelStripGeneration reports success.
//
// Returns the blueprint unchanged (same reference, no copy) when reelStripGeneration is absent, so a
// plain reelStrips/symbolWeights blueprint is entirely unaffected. The returned blueprint never
// carries a reelStripGeneration field — the runtime game module (renderGeneratedGameModule.ts) only
// ever sees a plain reelStrips array, exactly like a hand-authored one.
//
// Fails fast — throws — rather than materializing a reel as undefined, if the resolution doesn't
// actually cover every "generated" entry with a successful strip: missing (no summary for that
// reelIndex), duplicate (two summaries claiming the same reelIndex), or unsuccessful (success: false,
// or success: true with no strip, which resolveReelStripGeneration never produces but callers could).
export function materializeReelStrips(blueprint: GameBlueprint, reelStripGeneration: GameBuildInfoReelStripGeneration | undefined): GameBlueprint {
    const specs = blueprint.reelStripGeneration;
    if (specs === undefined) {
        return blueprint;
    }

    const stripsByReelIndex = new Map<number, string[]>();
    for (const summary of reelStripGeneration?.reels ?? []) {
        if (stripsByReelIndex.has(summary.reelIndex)) {
            throw new Error(
                `reelStripGeneration resolution has duplicate entries for reel ${summary.reelIndex}: cannot materialize reelStrips.`,
            );
        }
        if (!summary.success || summary.strip === undefined) {
            throw new Error(`reelStripGeneration[${summary.reelIndex}] did not generate successfully: cannot materialize reelStrips.`);
        }
        stripsByReelIndex.set(summary.reelIndex, summary.strip);
    }

    const reelStrips = specs.map((spec, reelIndex) => {
        if (spec.type === "literal") {
            return spec.strip;
        }

        const strip = stripsByReelIndex.get(reelIndex);
        if (strip === undefined) {
            throw new Error(`reelStripGeneration[${reelIndex}] is missing from the resolved generation result: cannot materialize reelStrips.`);
        }
        return strip;
    });

    const materialized: GameBlueprint = {...blueprint, reelStrips};
    Reflect.deleteProperty(materialized, "reelStripGeneration");
    return materialized;
}
