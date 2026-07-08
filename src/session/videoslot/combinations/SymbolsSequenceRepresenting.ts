import {SymbolsSequenceDescribing, SymbolsSequenceModifying} from "pokie";

export interface SymbolsSequenceRepresenting<T extends string | number | symbol = string>
    extends SymbolsSequenceDescribing<T>,
        SymbolsSequenceModifying<T> {}
