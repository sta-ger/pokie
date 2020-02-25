import {IChangeBetStrategy} from "./IChangeBetStrategy";

export interface IGameSessionSimulationConfig {

    numberOfRounds?: number;

    changeBetStrategy?: IChangeBetStrategy;

}
