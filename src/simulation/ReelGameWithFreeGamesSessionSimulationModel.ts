import {IGameSessionSimulationModel} from "./IGameSessionSimulationModel";
import {IReelGameWithFreeGamesSession} from "../session/videogames/reelgames/IReelGameWithFreeGamesSession";
import {GameSessionSimulationModel} from "./GameSessionSimulationModel";

export class ReelGameWithFreeGamesSessionSimulationModel implements IGameSessionSimulationModel {
    private readonly _session: IReelGameWithFreeGamesSession;
    private readonly _baseSession: GameSessionSimulationModel;

    constructor(session: IReelGameWithFreeGamesSession) {
        this._session = session;
        this._baseSession = new GameSessionSimulationModel(session);
    }

    public getRtp(): number {
        return this._baseSession.getRtp();
    }

    public getTotalBetAmount(): number {
        return this._baseSession.getTotalBetAmount();
    }

    public getTotalReturnAmount(): number {
        return this._baseSession.getTotalReturnAmount();
    }

    public updateTotalBetBeforePlay(): void {
        if (!this._session.getFreeGameSum()) {
            this._baseSession.updateTotalBetBeforePlay();
        }
    }

    public updateTotalReturnAfterPlay(): void {
        this._baseSession.updateTotalReturnAfterPlay();
    }
}
