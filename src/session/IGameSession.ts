export interface IGameSession {

    getCreditsAmount(): number;

    setCreditsAmount(value: number): void;

    getWinningAmount(): number;

    getAvailableBets(): number[];

    isBetAvailable(bet: number): boolean;

    getBet(): number;

    setBet(bet: number): void;

    canPlayNextGame(): boolean;

    play(): void;

}
