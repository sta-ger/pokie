import type {SymbolsSequenceDescribing} from "./SymbolsSequenceDescribing.js";
import {SymbolsSequence} from "./SymbolsSequence.js";
import {isWeightedSymbolsSequence} from "./WeightedSymbolsSequence.js";

/** Joint variant/stop events in authored variant order, then ascending circular stop. */
export function buildSequenceWindows<T extends string | number | symbol>(sequence: SymbolsSequenceDescribing<T>, rows: number): {windows: T[][]; weights: bigint[]; identity: unknown} {
    if (!(isWeightedSymbolsSequence(sequence))) return {windows: Array.from({length: sequence.getSize()}, (_, stop) => sequence.getSymbols(stop, rows)), weights: Array.from({length: sequence.getSize()}, () => BigInt(1)), identity: sequence.toArray()};
    const variants = sequence.getVariants(),
        weights = sequence.getIntegerWeights();
    const windows: T[][] = [],
        eventWeights: bigint[] = [];
    variants.forEach((variant, index) => {
        if (weights[index] === BigInt(0)) return;
        const strip = new SymbolsSequence<T>().fromArray([...variant.symbols]);
        for (let stop = 0; stop < strip.getSize(); stop++) {
            windows.push(strip.getSymbols(stop, rows));
            eventWeights.push(weights[index]);
        }
    });
    return {windows, weights: eventWeights, identity: {context: "logical-round-v1", variants}};
}
