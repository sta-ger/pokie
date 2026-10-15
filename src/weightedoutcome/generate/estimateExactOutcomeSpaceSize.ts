import {isWeightedSymbolsSequence} from "../../session/videoslot/combinations/WeightedSymbolsSequence.js";
import type {PokieGame} from "../../gamepackage/PokieGame.js";
import {ForcedSymbolsCombinationsGenerator} from "./internal/ForcedSymbolsCombinationsGenerator.js";
import type {OutcomeSpaceEstimate} from "./OutcomeSpaceEstimate.js";
import {WeightedOutcomeLibraryGenerationError} from "./WeightedOutcomeLibraryGenerationError.js";

/** A declared feature codec cannot be flattened by an injected grid-only factory. */
export function assertIndependentGridEnumerationSupported(game: PokieGame): void {
    let schema = game.getSessionStateSchema?.();
    while (schema && "base" in schema) {
        if (schema.kind === "bounded-mechanics" && schema.rules.weightedBonus) throw new WeightedOutcomeLibraryGenerationError("weighted-outcome-library-generation-unsupported", "Independent-grid outcome libraries and Stake conversion cannot preserve weighted bonus selection, payout or duration; build a TypeScript package instead.");
        schema = schema.base;
    }
}

// Reads a loaded PokieGame's own reel-strip sizes (via a throwaway probe session, forced with an empty grid
// that's never actually played) without enumerating anything -- cheap enough to call before deciding whether
// a full generateExactWeightedOutcomeLibrary run is even worth attempting. Fails closed the same way
// generation itself does: a game that doesn't implement createExactEnumerationSession has no exact outcome
// space to estimate at all, not an estimate of zero or Infinity.
export function estimateExactOutcomeSpaceSize(game: PokieGame): OutcomeSpaceEstimate {
    assertIndependentGridEnumerationSupported(game);
    if (typeof game.createExactEnumerationSession !== "function") {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-unsupported",
            `"${game.getManifest().id}" does not implement createExactEnumerationSession(); its outcome space cannot be exactly enumerated.`,
        );
    }

    const probe = game.createExactEnumerationSession(new ForcedSymbolsCombinationsGenerator<string>([]));
    const reelSizes = probe.getSymbolsSequences().map(sequence => isWeightedSymbolsSequence(sequence)
        ? sequence.getVariants().reduce((size, variant) => size + (variant.weight > 0 ? variant.symbols.length : 0), 0)
        : sequence.getSize());
    const totalOutcomeSpaceSize = reelSizes.reduce((total, size) => total * BigInt(size), BigInt(1));

    return {
        reelsNumber: probe.getReelsNumber(),
        reelsSymbolsNumber: probe.getScreenGeometry?.()?.generated.rows ?? probe.getReelsSymbolsNumber(),
        reelSizes,
        totalOutcomeSpaceSize,
    };
}
