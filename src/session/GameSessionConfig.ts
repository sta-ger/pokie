import {IGameSessionConfig} from "./IGameSessionConfig";

export class GameSessionConfig implements IGameSessionConfig {
    private _availableBets: number[] = [
        1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100,
    ];

    private _creditsAmount: number = 1000;

    private _bet: number;

    constructor() {
        this._bet = this._availableBets[0];
    }

    public get availableBets(): number[] {
        return this._availableBets;
    }

    public set availableBets(value: number[]) {
        this._availableBets = value;
        this._bet = this._availableBets[0];
    }

    public get creditsAmount(): number {
        return this._creditsAmount;
    }

    public set creditsAmount(value: number) {
        this._creditsAmount = value;
    }

    public get bet(): number {
        return this._bet;
    }

    public set bet(value: number) {
        this._bet = value;
    }

}
