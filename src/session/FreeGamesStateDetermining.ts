export interface FreeGamesStateDetermining {
    getFreeGamesNum(): number;

    getFreeGamesSum(): number;

    getFreeGamesBank(): number;

    /** Optional hard cap on total free games in one feature. */
    getMaxFreeGames?(): number | undefined;
}
