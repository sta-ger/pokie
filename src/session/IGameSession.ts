export interface IGameSession  {
    
    getCreditsAmount(): number;
    
    getAvailableBets(): number[];

    isBetAvailable(bet: number): boolean;
    
    getWinningAmount(): number;
    
    getBet(): number;
    
    setBet(bet: number): void;
    
    canPlayNextGame(): boolean;
    
    play(): void;
    
}
