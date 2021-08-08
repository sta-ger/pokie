import {IGameSessionSimulationConfig} from "./IGameSessionSimulationConfig";
import {IGameSessionSimulation} from "./IGameSessionSimulation";
import {IGameSession} from "..";
import {IChangeBetStrategy} from "./IChangeBetStrategy";
import {IGameSessionSimulationModel} from "./IGameSessionSimulationModel";
import {GameSessionSimulationModel} from "./GameSessionSimulationModel";

export class GameSessionSimulation implements IGameSessionSimulation {
    public beforePlayCallback?: () => void;
    public afterPlayCallback?: () => void;
    public onFinishedCallback?: () => void;

    private readonly _simulationModel: IGameSessionSimulationModel;
    private readonly _config: IGameSessionSimulationConfig;
    private readonly _session: IGameSession;
    private readonly _numberOfRounds: number;
    private readonly _changeBetStrategy?: IChangeBetStrategy;

    private _currentGameNumber: number = 0;

    constructor(
        session: IGameSession,
        config: IGameSessionSimulationConfig,
        simulationModel: IGameSessionSimulationModel = new GameSessionSimulationModel(session),
    ) {
        this._session = session;
        this._config = config;
        this._simulationModel = simulationModel;
        this._numberOfRounds = this._config.numberOfRounds ? this._config.numberOfRounds : 0;
        this._changeBetStrategy = config.changeBetStrategy;
        if (!this._numberOfRounds) {
            this._numberOfRounds = 1000;
        }
    }

    public run(): void {
        let i: number;
        for (i = 0; i < this._numberOfRounds; i++) {
            this.doBeforePlay();
            if (this.canPlayNextGame()) {
                this.doPlay();
            } else {
                this.setBetOnCantPlayNextBet();
                if (this.canPlayNextGame()) {
                    this.doPlay();
                } else {
                    break;
                }
            }
        }
        this.onFinished();
    }

    public getRtp(): number {
        return this._simulationModel.getRtp();
    }

    public getTotalBetAmount(): number {
        return this._simulationModel.getTotalBetAmount();
    }

    public getTotalReturn(): number {
        return this._simulationModel.getTotalReturnAmount();
    }

    public getCurrentGameNumber(): number {
        return this._currentGameNumber;
    }

    public getTotalGameToPlayNumber(): number {
        return this._numberOfRounds;
    }

    private setBetOnCantPlayNextBet(): void {
        let bets: number[];
        bets = this._session.getAvailableBets();
        bets.sort();
        this._session.setBet(bets[0]);
    }

    private onFinished(): void {
        if (this.onFinishedCallback) {
            this.onFinishedCallback();
        }
    }

    private canPlayNextGame(): boolean {
        return this._session.canPlayNextGame();
    }

    private setBetBeforePlay(): void {
        if (this._changeBetStrategy) {
            this._changeBetStrategy.setBetForPlay(this._session);
        }
    }

    private doPlay(): void {
        this._currentGameNumber++;
        this.setBetBeforePlay();
        this._simulationModel.updateTotalBetBeforePlay();
        this._session.play();
        this._simulationModel.updateTotalReturnAfterPlay();
        this.doAfterPlay();
    }

    private doBeforePlay(): void {
        if (this.beforePlayCallback) {
            this.beforePlayCallback();
        }
    }

    private doAfterPlay(): void {
        if (this.afterPlayCallback) {
            this.afterPlayCallback();
        }
    }
}
