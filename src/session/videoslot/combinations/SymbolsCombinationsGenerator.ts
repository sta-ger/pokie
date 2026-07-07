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
    private lastStopPositions: number[] = [];

    constructor(config: VideoSlotConfigDescribing<T>, rng: RandomNumberGenerating = new PseudorandomNumberGenerator()) {
        this.config = config;
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

    private getRandomReelSymbols(reelId: number): {symbols: T[]; position: number} {
        const sequence = this.config.getSymbolsSequences()[reelId];
        const position = this.rng.getRandomInt(0, sequence.getSize());
        return {symbols: sequence.getSymbols(position, this.config.getReelsSymbolsNumber()), position};
    }
}
