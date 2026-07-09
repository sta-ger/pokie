import {PseudorandomNumberGenerator} from "./PseudorandomNumberGenerator.js";
import type {RandomNumberGenerating} from "./RandomNumberGenerating.js";
import {SymbolsCombination} from "./SymbolsCombination.js";
import type {SymbolsCombinationDescribing} from "./SymbolsCombinationDescribing.js";
import type {SymbolsCombinationsGenerating} from "./SymbolsCombinationsGenerating.js";
import type {VideoSlotConfigDescribing} from "../VideoSlotConfigDescribing.js";

// A sibling of SymbolsCombinationsGenerator for games where the grid's shape isn't fixed but also
// isn't redrawn randomly every round (that's VariableHeightSymbolsCombinationsGenerator) — instead
// each reel's visible symbol count is explicit, persistent state that something external sets
// between rounds (e.g. a feature that grows or shrinks the grid based on round outcomes). Draws
// exactly reelsHeights[reelId] symbols per reel, same as the fixed generator but per-reel and
// mutable instead of one shared VideoSlotConfigDescribing.getReelsSymbolsNumber().
export class ResizableSymbolsCombinationsGenerator<T extends string | number | symbol = string>
implements SymbolsCombinationsGenerating<T> {
    private readonly config: VideoSlotConfigDescribing<T>;
    private readonly rng: RandomNumberGenerating;
    private reelsHeights: number[];
    private lastStopPositions: number[] = [];

    constructor(
        config: VideoSlotConfigDescribing<T>,
        initialReelsHeights: number[],
        rng: RandomNumberGenerating = new PseudorandomNumberGenerator(),
    ) {
        this.config = config;
        this.reelsHeights = [...initialReelsHeights];
        this.rng = rng;
    }

    public generateSymbolsCombination(): SymbolsCombinationDescribing<T> {
        const arr: T[][] = new Array(this.config.getReelsNumber());
        const stopPositions: number[] = new Array(this.config.getReelsNumber());
        for (let i = 0; i < this.config.getReelsNumber(); i++) {
            const reel = this.getRandomReelSymbols(i);
            arr[i] = reel.symbols;
            stopPositions[i] = reel.position;
        }
        this.lastStopPositions = stopPositions;
        return new SymbolsCombination<T>().fromMatrix(arr);
    }

    public getLastStopPositions(): number[] {
        return [...this.lastStopPositions];
    }

    public getReelsHeights(): number[] {
        return [...this.reelsHeights];
    }

    public setReelsHeights(reelsHeights: number[]): void {
        this.reelsHeights = [...reelsHeights];
    }

    private getRandomReelSymbols(reelId: number): {symbols: T[]; position: number} {
        const sequence = this.config.getSymbolsSequences()[reelId];
        const position = this.rng.getRandomInt(0, sequence.getSize());
        return {symbols: sequence.getSymbols(position, this.reelsHeights[reelId]), position};
    }
}
