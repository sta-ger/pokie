import type {GameBlueprint} from "./GameBlueprint.js";
import type {GameBuildInfoReelStripGeneration} from "./GameBuildInfoReelStripGeneration.js";
import {computeGameBlueprintHash} from "./computeGameBlueprintHash.js";
import {ReelStripGenerator} from "../reels/ReelStripGenerator.js";
import {ReelsSymbolsSequencesGenerator} from "../session/videoslot/combinations/ReelsSymbolsSequencesGenerator.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";

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
        return materializeSharedSymbolWeights(blueprint);
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
    return materializeSharedSymbolWeights(materialized);
}

// `symbolWeights` is an authored distribution, not per-round entropy.  Resolving it here makes one
// literal reel model part of the game identity before any runtime/session RNG is created.  The seed is
// derived from the authored model hash (and reel index), never a player/simulation seed: the same
// authored model therefore produces the same runtime, simulation, export and config hash.
function materializeSharedSymbolWeights(blueprint: GameBlueprint): GameBlueprint {
    if (blueprint.reelStrips !== undefined) {
        return blueprint;
    }

    if (blueprint.symbolWeights === undefined) {
        return materializeImplicitDefaultReels(blueprint);
    }

    const weights = blueprint.symbolWeights;
    const length = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    if (!Number.isSafeInteger(length) || length <= 0) {
        throw new Error("symbolWeights must resolve to a positive safe-integer reel length.");
    }

    const modelHash = computeGameBlueprintHash(blueprint);
    const generator = new ReelStripGenerator();
    const reelStrips: string[][] = [];
    for (let reelIndex = 0; reelIndex < blueprint.reels; reelIndex++) {
        const result = generator.generateFromSymbolWeights({
            length,
            symbolWeights: weights,
            seed: seedForResolvedReel(modelHash, reelIndex),
        });
        if (!result.success || result.strip === undefined) {
            throw new Error(`symbolWeights could not materialize reel ${reelIndex}.`);
        }
        reelStrips.push(result.strip.toArray());
    }

    const materialized: GameBlueprint = {...blueprint, reelStrips};
    Reflect.deleteProperty(materialized, "symbolWeights");
    return materialized;
}

// Omitting every explicit reel source is still a complete model choice, not permission for a
// session's round RNG to choose the model later.  Reproduce VideoSlotConfig's documented default
// distribution once here with a seed derived from the authored model, then embed the resulting
// strips just like every other source.  This keeps old, valid minimal blueprints playable while
// making runtime, simulation, sampled libraries and exports agree on one resolved reel model.
function materializeImplicitDefaultReels(blueprint: GameBlueprint): GameBlueprint {
    const modelHash = computeGameBlueprintHash(blueprint);
    const strips = new ReelsSymbolsSequencesGenerator<string>(new SeededRandomNumberGenerator(seedForResolvedReel(modelHash, 0)))
        .generate(blueprint.reels, blueprint.symbols, blueprint.wilds ?? [], blueprint.scatters ?? [])
        .map((strip) => strip.toArray());

    return {...blueprint, reelStrips: strips};
}

function seedForResolvedReel(modelHash: string, reelIndex: number): number {
    // FNV-1a is only a deterministic string-to-uint32 bridge for ReelStripGenerator's seed API;
    // it is not used as a fairness or round-RNG primitive.
    let hash = 0x811c9dc5;
    const value = `${modelHash}:resolved-reel:${reelIndex}`;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}
