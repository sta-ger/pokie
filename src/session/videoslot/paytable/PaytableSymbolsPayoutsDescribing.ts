export interface PaytableSymbolsPayoutsDescribing {
    getWinAmountForSymbol(symbolId: string, numberOfSymbols: number, bet: number): number;

    getAvailableSymbolsForBet(bet: number): string[];

    getNumbersOfSymbolsForBet(bet: number, symbolId: string): number[];
}
