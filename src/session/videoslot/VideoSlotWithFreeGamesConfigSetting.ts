export interface VideoSlotWithFreeGamesConfigSetting<T extends string | number | symbol = string> {
    setFreeGamesForScatters(symbolId: T, numberOfSymbols: number, freeGamesNum: number): void;
}
