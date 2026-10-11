export type VideoSlotWithFreeGamesSessionState = {
    freeGamesNum: number;
    freeGamesSum: number;
    freeGamesBank: number;
    // Last completed round's grant. Missing in legacy states and when the grant is zero.
    wonFreeGamesNumber?: number;
    base?: unknown;
};
