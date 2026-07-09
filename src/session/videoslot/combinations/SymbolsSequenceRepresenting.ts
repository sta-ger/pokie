import type {SymbolsSequenceDescribing} from "./SymbolsSequenceDescribing.js";
import type {SymbolsSequenceModifying} from "./SymbolsSequenceModifying.js";

export interface SymbolsSequenceRepresenting<T extends string | number | symbol = string>
    extends SymbolsSequenceDescribing<T>,
        SymbolsSequenceModifying<T> {}
