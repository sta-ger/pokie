export interface IGameSessionSimulation {
    
    run(): void;
    
    getRtp(): number;
    
    getTotalBetAmount(): number;
    
    getTotalReturn(): number;
    
    getCurrentGameNumber(): number;
    
}