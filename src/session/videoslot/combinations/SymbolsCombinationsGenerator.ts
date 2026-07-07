import {
    PseudorandomNumberGenerator,
    RandomNumberGenerating,
    SymbolsCombination,
    SymbolsCombinationDescribing,
    SymbolsCombinationsGenerating,
    VideoSlotConfigDescribing,
} from "pokie";

export class SymbolsCombinationsGenerator<T extends string | number | symbol = string>
implements SymbolsCombinationsGenerating<T> {
    private readonly rng: RandomNumberGenerating;
    private readonly config: VideoSlotConfigDescribing<T>;

    constructor(config: VideoSlotConfigDescribing<T>, rng: RandomNumberGenerating = new PseudorandomNumberGenerator()) {
        this.config = config;
        this.rng = rng;
    }

    public generateSymbolsCombination(): SymbolsCombinationDescribing<T> {
        const arr: T[][] = new Array(this.config.getReelsNumber());
        for (let i = 0; i < this.config.getReelsNumber(); i++) {
            arr[i] = this.getRandomReelSymbols(i);
        }
        return new SymbolsCombination<T>().fromMatrix(arr);
    }

    private getRandomReelSymbols(reelId: number): T[] {
        const sequence = this.config.getSymbolsSequences()[reelId];
        const random = this.rng.getRandomInt(0, sequence.getSize());
        return sequence.getSymbols(random, this.config.getReelsSymbolsNumber());
    }
}
