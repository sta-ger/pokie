export interface PaytableSymbolsPayoutsDescribing<T extends string | number | symbol = string> {
    getWinAmountForSymbol(symbolId: T, numberOfSymbols: number, bet: number): number;

    getAvailableSymbolsForBet(bet: number): T[];

    getNumbersOfSymbolsForBet(bet: number, symbolId: T): number[];
}
