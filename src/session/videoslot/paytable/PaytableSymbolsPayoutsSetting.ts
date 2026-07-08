export interface PaytableSymbolsPayoutsSetting<T extends string | number | symbol = string> {
    setPayoutForSymbol(symbolId: T, times: number, betMultiplier: number, bet?: number);
}
