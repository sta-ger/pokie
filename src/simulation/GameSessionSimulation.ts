import {IGameSessionSimulationConfig} from "./IGameSessionSimulationConfig";
import {IGameSessionSimulation} from "./IGameSessionSimulation";
import {IGameSession} from "../session/IGameSession";
import {GameSimulationChangeBetScenario} from "./GameSimulationChangeBetScenario";

export class GameSessionSimulation implements IGameSessionSimulation {
    protected _config: IGameSessionSimulationConfig;
    
    protected _session: IGameSession;
    protected _numberOfRounds: number;
    protected _changeBetScenario: string;
    protected _beforePlayCallback: () => void;
    protected _afterPlayCallback: () => void;
    protected _onFinishedCallback: () => void;
    
    protected _totalBet: number;
    protected _totalReturn: number;
    protected _rtp: number;
    
    protected _currentGameNumber: number;
    
    constructor(config: IGameSessionSimulationConfig) {
        this._config = config;
        this.initialize();
    }
    
    protected initialize(): void {
        this._totalBet = 0;
        this._totalReturn = 0;
        this._currentGameNumber = 0;
        this._session = this._config.session;
        this._numberOfRounds = this._config.numberOfRounds;
        this._changeBetScenario = this._config.changeBetScenario;
        if (!this._changeBetScenario) {
            this._changeBetScenario = GameSimulationChangeBetScenario.DONT_CHANGE;
        }
        this._beforePlayCallback = this._config.beforePlayCallback;
        this._afterPlayCallback = this._config.afterPlayCallback;
        this._onFinishedCallback = this._config.onFinishedCallback;
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
    
    protected setBetOnCantPlayNextBet(): void {
        let bets: number[];
        bets = this._session.getAcceptedBets();
        bets.sort();
        this._session.setBet(bets[0]);
    }
    
    protected onFinished(): void {
        if (this._onFinishedCallback) {
            this._onFinishedCallback();
        }
    }
    
    protected canPlayNextGame(): boolean {
        return this._session.canPlayNextGame();
    }
    
    protected setBetBeforePlay(): void {
        switch (this._changeBetScenario) {
            case GameSimulationChangeBetScenario.CHANGE_RANDOMLY:
                this.setRandomBet();
                break;
            default:
        }
    }
    
    protected setRandomBet(): void {
        let bet: number;
        let bets: number[];
        bets = this._session.getAcceptedBets();
        bet = bets[Math.floor(Math.random() * bets.length)];
        this._session.setBet(bet);
    }
    
    protected doPlay(): void {
        this._currentGameNumber++;
        this.setBetBeforePlay();
        this._totalBet += this._session.getBet();
        this._session.play();
        this._totalReturn += this._session.getWinningAmount();
        this.calculateRtp();
        this.doAfterPlay();
    }
    
    protected doBeforePlay(): void {
        if (this._beforePlayCallback) {
            this._beforePlayCallback();
        }
    }
    
    protected doAfterPlay(): void {
        if (this._afterPlayCallback) {
            this._afterPlayCallback();
        }
    }
    
    protected calculateRtp(): void {
        this._rtp = this._totalReturn / this._totalBet;
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
    
}