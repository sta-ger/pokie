import {IGameSession} from "../session/IGameSession";
import {IGameSessionSimulationModel} from "./IGameSessionSimulationModel";

export class GameSessionSimulationModel implements IGameSessionSimulationModel {
    private readonly _session: IGameSession;

    private _totalBet: number = 0;
    private _totalReturn: number = 0;
    private _rtp: number = 0;

    constructor(session: IGameSession) {
        this._session = session;
    }

    public getTotalBetAmount(): number {
        return this._totalBet;
    }

    public getTotalReturnAmount(): number {
        return this._totalReturn;
    }

    public updateTotalBetBeforePlay(): void {
        this._totalBet += this._session.getBet();
    }

    public updateTotalReturnAfterPlay(): void {
        this._totalReturn += this._session.getWinningAmount();
        this._rtp = this._totalReturn / this._totalBet;
    }

    public getRtp(): number {
        return this._rtp;
    }
}
