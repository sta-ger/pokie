import {IChangeBetStrategy} from "./IChangeBetStrategy";
import {IGameSessionSimulationConfig} from "./IGameSessionSimulationConfig";

export class GameSessionSimulationConfig implements IGameSessionSimulationConfig {
    private _changeBetStrategy?: IChangeBetStrategy;
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

    public get changeBetStrategy(): IChangeBetStrategy | undefined {
        return this._changeBetStrategy;
    }

    public set changeBetStrategy(value: IChangeBetStrategy | undefined) {
        this._changeBetStrategy = value;
    }
}
