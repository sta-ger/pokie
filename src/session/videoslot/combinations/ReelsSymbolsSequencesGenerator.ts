import type {RandomNumberGenerating} from "./RandomNumberGenerating.js";
import type {ReelsSymbolsSequencesGenerating} from "./ReelsSymbolsSequencesGenerating.js";
import {SymbolsSequence} from "./SymbolsSequence.js";
import type {SymbolsSequenceDescribing} from "./SymbolsSequenceDescribing.js";

export class ReelsSymbolsSequencesGenerator<T extends string | number | symbol = string>
implements ReelsSymbolsSequencesGenerating<T> {
    // Optional (defaults to unseeded Math.random(), same as before this param existed) -- passing a
    // SeededRandomNumberGenerator here makes every shuffle() call below deterministic, so the same
    // seed always produces the same default reel-strip content -- see VideoSlotConfig's own
    // constructor, which accepts an instance of this class to swap in.
    private readonly rng?: RandomNumberGenerating;

    constructor(rng?: RandomNumberGenerating) {
        this.rng = rng;
    }

    public generate(
        reelsNumber: number,
        availableSymbols: T[],
        wildSymbols: T[],
        scatterSymbols: T[],
    ): SymbolsSequenceDescribing<T>[] {
        const r: SymbolsSequenceDescribing<T>[] = [];
        for (let i = 0; i < reelsNumber; i++) {
            const reel = new SymbolsSequence<T>();
            const nonSpecialSymbols = availableSymbols.filter((symbolId) => {
                return !scatterSymbols.some((scatter) => scatter === symbolId) && !wildSymbols.includes(symbolId);
            });
            reel.fromNumberOfEachSymbol(nonSpecialSymbols, 15);
            wildSymbols.forEach((wild) => reel.addSymbol(wild, 5));
            scatterSymbols.forEach((scatter) => reel.addSymbol(scatter, 3));
            reel.shuffle(this.rng);
            while (
                reel
                    .getSymbolsStacksIndexes()
                    .some((stack) => scatterSymbols.some((scatter) => scatter === reel.getSymbol(stack.index)))
            ) {
                reel.shuffle(this.rng);
            }
            r.push(reel);
        }
        return r;
    }
}
