import {IGameSession} from "../session/IGameSession";
import {GameSimulationChangeBetScenario} from "./GameSimulationChangeBetScenario";

export interface IGameSessionSimulationConfig {
    
    session: IGameSession;
    
    numberOfRounds?: number;
    
    changeBetScenario?: GameSimulationChangeBetScenario;
    
}