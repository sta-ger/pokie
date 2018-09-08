import {IGameSession} from "../session/IGameSession";

export interface IGameSessionSimulationConfig {
    
    session: IGameSession;
    
    numberOfRounds?: number;
    
    changeBetScenario: string;
    
    beforePlayCallback?: () => void;
    
    afterPlayCallback?: () => void;
    
    onFinishedCallback?: () => void;
    
}