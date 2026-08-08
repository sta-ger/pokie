import type {GameBlueprint} from "../generated/GameBlueprint.js";
import {resolveReelStripGeneration} from "../generated/resolveReelStripGeneration.js";
import type {ReelStripGenerationSummary} from "../generated/ReelStripGenerationSummary.js";
import {ReelStrip} from "../reels/ReelStrip.js";
import {ReelStripAnalyzer} from "../reels/ReelStripAnalyzer.js";
import type {ReelStripGenerationDiagnostic} from "../reels/ReelStripGenerationDiagnostic.js";
import {ReelStripGenerator} from "../reels/ReelStripGenerator.js";
import type {ReelStripSymbolWeightsConversionDiagnostic} from "../reels/ReelStripSymbolWeightsConversionDiagnostic.js";
import {SymbolsSequence} from "../session/videoslot/combinations/SymbolsSequence.js";
import type {
    GameModelGameWindow,
    GameModelReel,
    GameModelReelGenerationMode,
    GameModelReels,
    GameModelReelStripPosition,
    GameModelSharedWeightsSample,
} from "./GameModelProjection.js";

// The engine's own built-in default reel weighting, applied when a blueprint configures none of
// reelStrips/reelStripGeneration/symbolWeights -- kept in sync with ReelsSymbolsSequencesGenerator's own
// hardcoded counts (15 per non-special symbol, 5 per wild, 3 per scatter). That generator's own
// Math.random()-based shuffle can't be sampled deterministically for a Studio preview (SymbolsSequence.
// shuffle() always uses Math.random(), never an injectable RNG), so buildSharedWeightsSample below
// re-derives an equivalent weight table and runs it through the deterministic ReelStripGenerator instead.
const DEFAULT_NON_SPECIAL_SYMBOL_COUNT = 15;
const DEFAULT_WILD_SYMBOL_COUNT = 5;
const DEFAULT_SCATTER_SYMBOL_COUNT = 3;

// Arbitrary but fixed -- exists purely so the same blueprint always previews the same sample strip in
// Studio. Never the seed any real session actually uses: symbolWeights/default-mode strips are reshuffled
// fresh via Math.random() every session (see VideoSlotConfig.setAvailableSymbols /
// ReelsSymbolsSequencesGenerator), and neither path is seedable.
const SHARED_WEIGHTS_SAMPLE_SEED = 1;

function describeReelGenerationMode(blueprint: GameBlueprint): GameModelReelGenerationMode {
    if (blueprint.reelStrips !== undefined) {
        return "reelStrips";
    }
    if (blueprint.reelStripGeneration !== undefined) {
        return "reelStripGeneration";
    }
    if (blueprint.symbolWeights !== undefined) {
        return "symbolWeights";
    }
    return "default";
}

// Every position's own stackSize, via SymbolsSequence.getSymbolsStacksIndexes -- the engine's own,
// already-tested circular-run detection -- rather than re-deriving run lengths by hand here.
function positionsFromStrip(strip: string[], wilds: string[], scatters: string[], lockedPositions: Record<number, string> | undefined): GameModelReelStripPosition[] {
    const stackSizeByIndex = new Map<number, number>();
    for (const stack of new SymbolsSequence().fromArray(strip).getSymbolsStacksIndexes()) {
        for (let offset = 0; offset < stack.size; offset++) {
            stackSizeByIndex.set((stack.index + offset) % strip.length, stack.size);
        }
    }
    return strip.map((symbolId, index) => ({
        index,
        symbolId,
        isWild: wilds.includes(symbolId),
        isScatter: scatters.includes(symbolId),
        locked: lockedPositions?.[index] !== undefined,
        stackSize: stackSizeByIndex.get(index) ?? 1,
    }));
}

// The Game window at stop position 0 -- the first `rows` symbols of whichever strip each reel actually
// resolves to, read via ReelStrip.getSymbolAt so a strip shorter than `rows` wraps exactly like a real
// spin's screen window would (see ReelStripDefinition's own doc comment on circular index resolution).
function buildGameWindow(reelsCount: number, rows: number, strips: string[][], wilds: string[], scatters: string[]): GameModelGameWindow {
    const grid = Array.from({length: reelsCount}, (_, reelIndex) => {
        const strip = strips[reelIndex];
        if (strip === undefined || strip.length === 0 || rows <= 0) {
            return [];
        }
        const reelStrip = new ReelStrip(strip);
        return Array.from({length: rows}, (_, rowIndex) => {
            const symbolId = reelStrip.getSymbolAt(rowIndex);
            return {symbolId, isWild: wilds.includes(symbolId), isScatter: scatters.includes(symbolId)};
        });
    });
    return {reels: reelsCount, rows, wrapsAround: true, grid};
}

function buildReelFromLiteralStrip(reelIndex: number, strip: string[], wilds: string[], scatters: string[]): GameModelReel {
    return {
        reelIndex,
        source: "literal",
        positions: positionsFromStrip(strip, wilds, scatters, undefined),
        analysis: ReelStripAnalyzer.analyze(new ReelStrip(strip)),
    };
}

function describeUnresolvedReason(summary: ReelStripGenerationSummary | undefined): string {
    const lastDiagnostic = summary !== undefined && summary.diagnostics.length > 0 ? summary.diagnostics[summary.diagnostics.length - 1] : undefined;
    if (lastDiagnostic !== undefined && lastDiagnostic.violations.length > 0) {
        return lastDiagnostic.violations.map((violation) => violation.message).join(" ");
    }
    return `Could not satisfy every constraint after ${summary?.attemptsUsed ?? 0} attempt(s).`;
}

// Runs blueprint.reelStripGeneration through the existing resolveReelStripGeneration -- the exact same
// resolution "pokie build" itself performs -- and turns each entry (literal or generated, resolved or
// not) into its own GameModelReel, never re-implementing generation or its diagnostics here.
function buildReelsFromGeneration(blueprint: GameBlueprint, wilds: string[], scatters: string[]): GameModelReel[] {
    const specs = blueprint.reelStripGeneration ?? [];
    const resolution = resolveReelStripGeneration(blueprint, new ReelStripGenerator());
    const summaries: ReelStripGenerationSummary[] = resolution.success ? (resolution.reelStripGeneration?.reels ?? []) : resolution.reels;
    const summaryByReelIndex = new Map(summaries.map((summary) => [summary.reelIndex, summary]));

    return specs.map((spec, reelIndex): GameModelReel => {
        if (spec.type === "literal") {
            return buildReelFromLiteralStrip(reelIndex, spec.strip, wilds, scatters);
        }
        const summary = summaryByReelIndex.get(reelIndex);
        const diagnostics: ReelStripGenerationDiagnostic[] = summary?.diagnostics ?? [];
        if (summary === undefined || !summary.success || summary.strip === undefined) {
            return {reelIndex, source: "generated", reason: describeUnresolvedReason(summary), generationDiagnostics: diagnostics};
        }
        return {
            reelIndex,
            source: "generated",
            positions: positionsFromStrip(summary.strip, wilds, scatters, spec.lockedPositions),
            analysis: ReelStripAnalyzer.analyze(new ReelStrip(summary.strip)),
            generationDiagnostics: diagnostics,
        };
    });
}

// A shared symbol-weights table (real blueprint.symbolWeights, or the engine's own built-in default
// weighting) has no fixed strip -- every reel independently reshuffles the same pool via Math.random() on
// every session (see this file's own doc comment). One reproducible sample strip per physical reel is
// generated instead, each with its own seed (sampleSeed + reelIndex) so the sample reflects
// "independently shuffled" honestly rather than repeating one strip across every reel. `sampleSeed`
// defaults to SHARED_WEIGHTS_SAMPLE_SEED (see buildGameModelReels' own doc comment) but a caller may pass
// a different one to re-roll a fresh, still-reproducible dynamic inspection sample (see the "New sample"
// action in Studio's own Game Model Reels view) -- never a random, unreproducible one.
function buildReelsFromSharedWeights(
    weights: Record<string, number>,
    reelsCount: number,
    wilds: string[],
    scatters: string[],
    sampleSeed: number,
): {sample: GameModelSharedWeightsSample; reels: GameModelReel[]} {
    const symbolIds = Object.keys(weights);
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    const sampleLength = symbolIds.length === 0 ? 0 : Math.max(1, Math.round(totalWeight));

    const generator = new ReelStripGenerator();
    const reels: GameModelReel[] = [];
    let conversion: ReelStripSymbolWeightsConversionDiagnostic | undefined;

    for (let reelIndex = 0; reelIndex < reelsCount; reelIndex++) {
        if (sampleLength === 0) {
            reels.push({reelIndex, source: "sample", positions: [], analysis: ReelStripAnalyzer.analyze(new ReelStrip(["—"]))});
            continue;
        }
        const seed = sampleSeed + reelIndex;
        const result = generator.generateFromSymbolWeights({length: sampleLength, symbolWeights: weights, seed});
        conversion ??= result.symbolWeightsConversion;
        const strip = result.strip?.toArray() ?? [];
        reels.push({
            reelIndex,
            source: "sample",
            positions: positionsFromStrip(strip, wilds, scatters, undefined),
            analysis: ReelStripAnalyzer.analyze(new ReelStrip(strip.length > 0 ? strip : ["—"])),
        });
    }

    return {
        sample: {
            weights,
            seed: sampleSeed,
            sampleLength,
            conversion: conversion ?? {weights, counts: {}, targetProportions: {}, actualProportions: {}, deviations: {}},
        },
        reels,
    };
}

// The engine's own built-in default weighting (see ReelsSymbolsSequencesGenerator), expressed as the
// same weights shape buildReelsFromSharedWeights already knows how to sample from.
function defaultWeightsFor(symbols: string[], wilds: string[], scatters: string[]): Record<string, number> {
    const weights: Record<string, number> = {};
    for (const symbolId of symbols) {
        if (scatters.includes(symbolId)) {
            weights[symbolId] = DEFAULT_SCATTER_SYMBOL_COUNT;
        } else if (wilds.includes(symbolId)) {
            weights[symbolId] = DEFAULT_WILD_SYMBOL_COUNT;
        } else {
            weights[symbolId] = DEFAULT_NON_SPECIAL_SYMBOL_COUNT;
        }
    }
    return weights;
}

function stripsOf(reels: GameModelReel[]): string[][] {
    return reels.map((reel) => ("positions" in reel ? reel.positions.map((position) => position.symbolId) : []));
}

// Converts a "symbolWeights"/"default" blueprint's shared-weights sample into editable per-reel strips
// -- reuses this file's own weights -> sample math verbatim (the exact same buildReelsFromSharedWeights
// this file already runs for "symbolWeights"/"default" previews) so the strips a caller freezes into
// blueprint.reelStrips are byte-for-byte the same reproducible sample the read-only projection already
// showed, never a second, independently re-derived conversion. Only meaningful for a blueprint with no
// reelStrips/reelStripGeneration of its own -- deciding whether this action even applies to a given
// blueprint is the caller's own concern. `sampleSeed` defaults to the same SHARED_WEIGHTS_SAMPLE_SEED
// buildGameModelReels itself defaults to -- pass whichever seed a previously shown "New sample" preview
// actually used to convert exactly what was seen, never a silently different one.
export function convertSharedWeightsToReelStrips(blueprint: GameBlueprint, sampleSeed: number = SHARED_WEIGHTS_SAMPLE_SEED): string[][] {
    const wilds = blueprint.wilds ?? [];
    const scatters = blueprint.scatters ?? [];
    const weights = blueprint.symbolWeights !== undefined ? blueprint.symbolWeights : defaultWeightsFor(blueprint.symbols, wilds, scatters);
    const {reels} = buildReelsFromSharedWeights(weights, blueprint.reels, wilds, scatters, sampleSeed);
    return stripsOf(reels);
}

export type BuildGameModelReelsOptions = {
    // Overrides SHARED_WEIGHTS_SAMPLE_SEED for a "symbolWeights"/"default" blueprint's own dynamic
    // inspection sample -- ignored for "reelStrips"/"reelStripGeneration" (see GameModelReel's own doc
    // comment for why only those two have no fixed strip to begin with). Lets a caller re-roll a fresh,
    // still-reproducible sample (Studio's own "New sample" action) without ever inventing an unlabeled
    // fixed strip in its place.
    sharedWeightsSampleSeed?: number;
};

// The Game Model Reels view's own data: which of the four ways this blueprint configures its reels
// (see GameModelReelGenerationMode), plus the truthful Game window / Full strips / Analysis data that
// generation mode actually supports -- "reelStrips"/"reelStripGeneration" get their own real, fixed
// strips; "symbolWeights"/"default" (neither of which has one -- see GameModelSharedWeightsSample's own
// doc comment) get a reproducible, clearly-labeled sample instead. Nothing here re-implements reel-strip
// generation, resolution, or analysis -- every number comes from resolveReelStripGeneration/
// ReelStripGenerator/ReelStripAnalyzer, the exact same tools "pokie build" itself uses.
export function buildGameModelReels(blueprint: GameBlueprint, options?: BuildGameModelReelsOptions): GameModelReels {
    const wilds = blueprint.wilds ?? [];
    const scatters = blueprint.scatters ?? [];
    const generationMode = describeReelGenerationMode(blueprint);

    if (blueprint.reelStrips !== undefined) {
        const reels = blueprint.reelStrips.map((strip, reelIndex) => buildReelFromLiteralStrip(reelIndex, strip, wilds, scatters));
        return {generationMode, gameWindow: buildGameWindow(blueprint.reels, blueprint.rows, stripsOf(reels), wilds, scatters), reels};
    }

    if (blueprint.reelStripGeneration !== undefined) {
        const reels = buildReelsFromGeneration(blueprint, wilds, scatters);
        return {generationMode, gameWindow: buildGameWindow(blueprint.reels, blueprint.rows, stripsOf(reels), wilds, scatters), reels};
    }

    const weights = blueprint.symbolWeights !== undefined ? blueprint.symbolWeights : defaultWeightsFor(blueprint.symbols, wilds, scatters);
    const {sample, reels} = buildReelsFromSharedWeights(weights, blueprint.reels, wilds, scatters, options?.sharedWeightsSampleSeed ?? SHARED_WEIGHTS_SAMPLE_SEED);
    return {
        generationMode,
        gameWindow: buildGameWindow(blueprint.reels, blueprint.rows, stripsOf(reels), wilds, scatters),
        reels,
        sharedWeightsSample: sample,
    };
}
