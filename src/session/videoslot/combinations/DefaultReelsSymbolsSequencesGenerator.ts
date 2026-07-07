import {ReelsSymbolsSequencesGenerating, SymbolsSequence, SymbolsSequenceDescribing} from "pokie";

export class DefaultReelsSymbolsSequencesGenerator<T extends string | number | symbol = string>
implements ReelsSymbolsSequencesGenerating<T> {
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
            reel.shuffle();
            while (
                reel
                    .getSymbolsStacksIndexes()
                    .some((stack) => scatterSymbols.some((scatter) => scatter === reel.getSymbol(stack.index)))
            ) {
                reel.shuffle();
            }
            r.push(reel);
        }
        return r;
    }
}
