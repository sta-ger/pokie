import {PseudorandomNumberGenerator} from "./PseudorandomNumberGenerator.js";
import type {RandomNumberGenerating} from "./RandomNumberGenerating.js";
import {SymbolsCombination} from "./SymbolsCombination.js";
import type {SymbolsCombinationDescribing} from "./SymbolsCombinationDescribing.js";
import type {SymbolsCombinationsGenerating} from "./SymbolsCombinationsGenerating.js";
import type {SymbolsSequenceDescribing} from "./SymbolsSequenceDescribing.js";
import type {VideoSlotConfigDescribing} from "../VideoSlotConfigDescribing.js";

// A sibling of SymbolsCombinationsGenerator for games where each reel's visible symbol count is
// drawn per round from its own weighted distribution (reelsHeightWeights[reelId] — an ordinary
// SymbolsSequenceDescribing<number>, reusing the same weighted-pool primitive as symbol reel
// strips, just with heights as the "symbols") instead of the fixed
// VideoSlotConfigDescribing.getReelsSymbolsNumber() every reel shares. The resulting grid is
// legitimately jagged (T[][] with different-length reels); every grid-transform/win-shape helper
// this generator is meant to pair with (getWaysForSymbol, getSymbolsClusters,
// collapseAndRefillSymbols, overlaySymbols) already operates per-reel-length rather than assuming a
// uniform height, so no other pokie code needs to change to support this.
export class VariableHeightSymbolsCombinationsGenerator<T extends string | number | symbol = string>
implements SymbolsCombinationsGenerating<T> {
    private readonly config: VideoSlotConfigDescribing<T>;
    private readonly reelsHeightWeights: SymbolsSequenceDescribing<number>[];
    private readonly rng: RandomNumberGenerating;
    private lastStopPositions: number[] = [];
    private lastReelsHeights: number[] = [];

    constructor(
        config: VideoSlotConfigDescribing<T>,
        reelsHeightWeights: SymbolsSequenceDescribing<number>[],
        rng: RandomNumberGenerating = new PseudorandomNumberGenerator(),
    ) {
        this.config = config;
        this.reelsHeightWeights = reelsHeightWeights;
        this.rng = rng;
    }

    public generateSymbolsCombination(): SymbolsCombinationDescribing<T> {
        const arr: T[][] = new Array(this.config.getReelsNumber());
        const stopPositions: number[] = new Array(this.config.getReelsNumber());
        const heights: number[] = new Array(this.config.getReelsNumber());
        for (let i = 0; i < this.config.getReelsNumber(); i++) {
            const height = this.getRandomHeight(i);
            const reel = this.getRandomReelSymbols(i, height);
            arr[i] = reel.symbols;
            stopPositions[i] = reel.position;
            heights[i] = height;
        }
        this.lastStopPositions = stopPositions;
        this.lastReelsHeights = heights;
        return new SymbolsCombination<T>().fromMatrix(arr);
    }

    public getLastStopPositions(): number[] {
        return [...this.lastStopPositions];
    }

    // Not part of SymbolsCombinationsGenerating — callers already hold this concrete type (they
    // had to, to pass reelsHeightWeights into the constructor), so there's no need to widen the
    // shared interface just to expose it.
    public getLastReelsHeights(): number[] {
        return [...this.lastReelsHeights];
    }

    private getRandomHeight(reelId: number): number {
        const heights = this.reelsHeightWeights[reelId];
        return heights.getSymbol(this.rng.getRandomInt(0, heights.getSize()));
    }

    private getRandomReelSymbols(reelId: number, height: number): {symbols: T[]; position: number} {
        const sequence = this.config.getSymbolsSequences()[reelId];
        const position = this.rng.getRandomInt(0, sequence.getSize());
        return {symbols: sequence.getSymbols(position, height), position};
    }
}
