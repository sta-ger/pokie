import {IGameSessionModel} from "../IGameSessionModel";

export interface IGameSessionFlow {
    
    create(model: IGameSessionModel): void;
    
    play(): void;
    
    canPlayNextGame(): boolean;
    
}
