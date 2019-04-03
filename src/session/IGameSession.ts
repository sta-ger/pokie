export interface IGameSession  {
    
    getCreditsAmount(): number;

    setCreditsAmount(value: number): void;
    
    getAvailableBets(): number[];

    isBetAvailable(bet: number): boolean;
    
    getBet(): number;
    
    setBet(bet: number): void;
    
    canPlayNextGame(): boolean;
    
    play(): void;
    
}
