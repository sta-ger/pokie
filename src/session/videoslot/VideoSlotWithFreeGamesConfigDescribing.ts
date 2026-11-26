export interface VideoSlotWithFreeGamesConfigDescribing<T extends string | number | symbol = string> {
    getFreeGamesForScatters(symbolId: T, numberOfSymbols: number): number;
    /** Optional authored hard cap on total free games in one feature (initial award plus retriggers). */
    getMaxFreeGames?(): number | undefined;
}
