import {IGameSessionSimulationConfig} from "./IGameSessionSimulationConfig";
import {IGameSessionSimulation} from "./IGameSessionSimulation";
import {GameSimulationChangeBetScenario} from "./GameSimulationChangeBetScenario";
import {IGameSession} from "..";

export class GameSessionSimulation implements IGameSessionSimulation {
    public beforePlayCallback?: () => void;
    public afterPlayCallback?: () => void;
    public onFinishedCallback?: () => void;

    private readonly _config: IGameSessionSimulationConfig;
    private readonly _session: IGameSession;
    private readonly _numberOfRounds: number;
    private readonly _changeBetScenario?: GameSimulationChangeBetScenario;

    private _totalBet: number = 0;
    private _totalReturn: number = 0;
    private _rtp: number = 0;

    private _currentGameNumber: number = 0;

    constructor(session: IGameSession, config: IGameSessionSimulationConfig) {
        this._session = session;
        this._config = config;
        this._numberOfRounds = this._config.numberOfRounds ? this._config.numberOfRounds : 0;
        this._changeBetScenario = this._config.changeBetStrategy;
        if (!this._changeBetScenario) {
            this._changeBetScenario = GameSimulationChangeBetScenario.DontChange;
        }
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
        return this._rtp;
    }

    public getTotalBetAmount(): number {
        return this._totalBet;
    }

    public getTotalReturn(): number {
        return this._totalReturn;
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
        if (this._changeBetScenario === GameSimulationChangeBetScenario.ChangeRandomly) {
            this.setRandomBet();
        }
    }

    private setRandomBet(): void {
        let bet: number;
        let bets: number[];
        bets = this._session.getAvailableBets();
        bet = bets[Math.floor(Math.random() * bets.length)];
        this._session.setBet(bet);
    }

    private doPlay(): void {
        this._currentGameNumber++;
        this.setBetBeforePlay();
        this._totalBet += this._session.getBet();
        this._session.play();
        this._totalReturn += this._session.getWinningAmount();
        this.calculateRtp();
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

    private calculateRtp(): void {
        this._rtp = this._totalReturn / this._totalBet;
    }

}
