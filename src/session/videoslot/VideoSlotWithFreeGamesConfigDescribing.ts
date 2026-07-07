export interface VideoSlotWithFreeGamesConfigDescribing<T extends string | number | symbol = string> {
    getFreeGamesForScatters(symbolId: T, numberOfSymbols: number): number;
}
