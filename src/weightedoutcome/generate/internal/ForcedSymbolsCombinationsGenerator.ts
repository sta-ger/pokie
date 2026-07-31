import {SymbolsCombination} from "../../../session/videoslot/combinations/SymbolsCombination.js";
import type {SymbolsCombinationDescribing} from "../../../session/videoslot/combinations/SymbolsCombinationDescribing.js";
import type {SymbolsCombinationsGenerating} from "../../../session/videoslot/combinations/SymbolsCombinationsGenerating.js";

// The DI seam exact enumeration relies on: a SymbolsCombinationsGenerating that always returns one
// caller-supplied grid instead of drawing from randomness, so a session built via
// PokieGame.createExactEnumerationSession still runs its own real play()/win-calculation path (the "same
// calculation path" guarantee generateExactWeightedOutcomeLibrary depends on) for a specific, forced outcome.
export class ForcedSymbolsCombinationsGenerator<T extends string | number | symbol = string> implements SymbolsCombinationsGenerating<T> {
    private readonly combination: SymbolsCombinationDescribing<T>;

    constructor(grid: T[][]) {
        this.combination = new SymbolsCombination<T>().fromMatrix(grid);
    }

    public generateSymbolsCombination(): SymbolsCombinationDescribing<T> {
        return this.combination;
    }
}
