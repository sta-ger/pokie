import {IChangeBetStrategy} from "./IChangeBetStrategy";

export interface IGameSessionSimulationConfig {

    numberOfRounds?: number;

    changeBetStrategy?: IChangeBetStrategy;

}

class GameSessionSimulationConfigImpl implements IGameSessionSimulationConfig {
    private _changeBetStrategy: IChangeBetStrategy | undefined;
    private _numberOfRounds: number = 0;

    constructor(numberOfRounds?: number, changeBetStrategy?: IChangeBetStrategy) {
        this._changeBetStrategy = changeBetStrategy;
        if (numberOfRounds) {
            this._numberOfRounds = numberOfRounds;
        }
    }

    public get numberOfRounds(): number {
        return this._numberOfRounds;
    }

    public set numberOfRounds(value: number) {
        this._numberOfRounds = value;
    }

    public get changeBetStrategy(): GameSimulationChangeBetScenario {
        return this._changeBetStrategy;
    }

    public set changeBetStrategy(value: GameSimulationChangeBetScenario) {
        this._changeBetStrategy = value;
    }
}
