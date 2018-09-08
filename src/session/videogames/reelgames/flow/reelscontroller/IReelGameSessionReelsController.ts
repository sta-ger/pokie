export interface IReelGameSessionReelsController {
    
    spin(): void;
    
    getItems(): string[][];
    
    flipMatrix(source: any[][]): any[][]
    
}
