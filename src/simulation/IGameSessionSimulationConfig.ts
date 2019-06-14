import {IGameSession} from "..";
import {GameSimulationChangeBetScenario} from "./GameSimulationChangeBetScenario";

export interface IGameSessionSimulationConfig {
    
    session: IGameSession;
    
    numberOfRounds?: number;
    
    changeBetScenario?: GameSimulationChangeBetScenario;
    
}
