import type {SymbolsSequenceDescribing} from "./SymbolsSequenceDescribing.js";
import type {WeightedSequenceVariant} from "./WeightedSequenceVariant.js";

export interface WeightedSymbolsSequenceDescribing<T extends string | number | symbol = string> extends SymbolsSequenceDescribing<T> {
    getSequenceKind(): "weighted-whole-sequence-v1";
    getVariants(): WeightedSequenceVariant<T>[];
    getIntegerWeights(): bigint[];
    getProbabilities(): number[];
}
