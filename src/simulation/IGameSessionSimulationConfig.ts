import {IGameSession} from "..";
import {GameSimulationChangeBetScenario} from "./GameSimulationChangeBetScenario";

export interface IGameSessionSimulationConfig {
    
    numberOfRounds?: number;
    
    changeBetScenario?: GameSimulationChangeBetScenario;
    
}
