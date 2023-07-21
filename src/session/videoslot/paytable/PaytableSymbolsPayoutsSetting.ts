export interface PaytableSymbolsPayoutsSetting {
    setPayoutForSymbol(symbolId: string, times: number, betMultiplier: number, bet?: number);
}
