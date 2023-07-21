import {
    PseudorandomNumberGenerator,
    RandomNumberGenerating,
    SymbolsCombination,
    SymbolsCombinationDescribing,
    SymbolsCombinationsGenerating,
    VideoSlotConfigDescribing,
} from "pokie";

export class SymbolsCombinationsGenerator implements SymbolsCombinationsGenerating {
    private readonly rng: RandomNumberGenerating;
    private readonly config: VideoSlotConfigDescribing;

    constructor(config: VideoSlotConfigDescribing, rng: RandomNumberGenerating = new PseudorandomNumberGenerator()) {
        this.config = config;
        this.rng = rng;
    }

    public generateSymbolsCombination(): SymbolsCombinationDescribing {
        const arr: string[][] = new Array(this.config.getReelsNumber());
        for (let i = 0; i < this.config.getReelsNumber(); i++) {
            arr[i] = this.getRandomReelSymbols(i);
        }
        return new SymbolsCombination().fromMatrix(arr);
    }

    private getRandomReelSymbols(reelId: number): string[] {
        const sequence = this.config.getSymbolsSequences()[reelId];
        const random = this.rng.getRandomInt(0, sequence.getSize());
        return sequence.getSymbols(random, this.config.getReelsSymbolsNumber());
    }
}
