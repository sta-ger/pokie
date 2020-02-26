import {IChangeBetStrategy} from "./IChangeBetStrategy";
import {IGameSessionSimulationConfig} from "./IGameSessionSimulationConfig";

export class GameSessionSimulationConfig implements IGameSessionSimulationConfig {
    private _changeBetStrategy?: IChangeBetStrategy;
    private _numberOfRounds?: number;

    constructor(numberOfRounds?: number, changeBetStrategy?: IChangeBetStrategy) {
        this._changeBetStrategy = changeBetStrategy;
        this._numberOfRounds = numberOfRounds;
    }

    public get numberOfRounds(): number | undefined {
        return this._numberOfRounds;
    }

    public set numberOfRounds(value: number | undefined) {
        this._numberOfRounds = value;
    }

    public get changeBetStrategy(): IChangeBetStrategy | undefined {
        return this._changeBetStrategy;
    }

    public set changeBetStrategy(value: IChangeBetStrategy | undefined) {
        this._changeBetStrategy = value;
    }
}
