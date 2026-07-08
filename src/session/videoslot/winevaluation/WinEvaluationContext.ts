import {SymbolsCombinationDescribing} from "../combinations/SymbolsCombinationDescribing.js";
import {VideoSlotConfigDescribing} from "../VideoSlotConfigDescribing.js";

export class WinEvaluationContext<T extends string | number | symbol = string> {
    private readonly bet: number;
    private readonly symbolsCombination: SymbolsCombinationDescribing<T>;
    private readonly config: VideoSlotConfigDescribing<T>;
    private readonly metadata: Record<string, unknown>;

    constructor(
        bet: number,
        symbolsCombination: SymbolsCombinationDescribing<T>,
        config: VideoSlotConfigDescribing<T>,
        metadata: Record<string, unknown> = {},
    ) {
        this.bet = bet;
        this.symbolsCombination = symbolsCombination;
        this.config = config;
        this.metadata = {...metadata};
    }

    public getBet(): number {
        return this.bet;
    }

    public getSymbolsCombination(): SymbolsCombinationDescribing<T> {
        return this.symbolsCombination;
    }

    public getConfig(): VideoSlotConfigDescribing<T> {
        return this.config;
    }

    public getMetadata(): Record<string, unknown> {
        return {...this.metadata};
    }
}
