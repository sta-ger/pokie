export interface IGameSession  {
    
    getCreditsAmount(): number;
    
    getAcceptedBets(): number[];
    
    getWinningAmount(): number;
    
    getBet(): number;
    
    setBet(bet: number): void;
    
    canPlayNextGame(): boolean;
    
    play(): void;
    
}
