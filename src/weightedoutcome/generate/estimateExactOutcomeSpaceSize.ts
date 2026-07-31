import type {PokieGame} from "../../gamepackage/PokieGame.js";
import {ForcedSymbolsCombinationsGenerator} from "./internal/ForcedSymbolsCombinationsGenerator.js";
import type {OutcomeSpaceEstimate} from "./OutcomeSpaceEstimate.js";
import {WeightedOutcomeLibraryGenerationError} from "./WeightedOutcomeLibraryGenerationError.js";

// Reads a loaded PokieGame's own reel-strip sizes (via a throwaway probe session, forced with an empty grid
// that's never actually played) without enumerating anything -- cheap enough to call before deciding whether
// a full generateExactWeightedOutcomeLibrary run is even worth attempting. Fails closed the same way
// generation itself does: a game that doesn't implement createExactEnumerationSession has no exact outcome
// space to estimate at all, not an estimate of zero or Infinity.
export function estimateExactOutcomeSpaceSize(game: PokieGame): OutcomeSpaceEstimate {
    if (typeof game.createExactEnumerationSession !== "function") {
        throw new WeightedOutcomeLibraryGenerationError(
            "weighted-outcome-library-generation-unsupported",
            `"${game.getManifest().id}" does not implement createExactEnumerationSession(); its outcome space cannot be exactly enumerated.`,
        );
    }

    const probe = game.createExactEnumerationSession(new ForcedSymbolsCombinationsGenerator<string>([]));
    const reelSizes = probe.getSymbolsSequences().map((sequence) => sequence.getSize());
    const totalOutcomeSpaceSize = reelSizes.reduce((total, size) => total * BigInt(size), BigInt(1));

    return {
        reelsNumber: probe.getReelsNumber(),
        reelsSymbolsNumber: probe.getReelsSymbolsNumber(),
        reelSizes,
        totalOutcomeSpaceSize,
    };
}
