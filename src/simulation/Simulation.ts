import {
    BetForNextSimulationRoundSetting,
    GameSessionHandling,
    NextSessionRoundPlayableDetermining,
    SimulationConfigRepresenting,
    SimulationHandling,
} from "pokie";

export class Simulation implements SimulationHandling {
    private readonly session: GameSessionHandling;
    private readonly numberOfRounds: number;
    private readonly changeBetStrategy: BetForNextSimulationRoundSetting | undefined;
    private readonly playStrategy: NextSessionRoundPlayableDetermining | undefined;

    private totalBet = 0;
    private totalReturn = 0;
    private rtp = 0;

    private currentGameNumber = 0;

    private beforePlayCallback?: () => void;
    private afterPlayCallback?: () => void;
    private onFinishedCallback?: () => void;

    constructor(session: GameSessionHandling, config: SimulationConfigRepresenting) {
        this.session = session;
        this.numberOfRounds = config.getNumberOfRounds();
        this.changeBetStrategy = config.getChangeBetStrategy();
        this.playStrategy = config.getPlayStrategy();
    }

    public run(): void {
        let i: number;
        this.doPlay();
        for (i = 0; i < this.numberOfRounds - 1; i++) {
            if (this.canPlayNextGame()) {
                this.doPlay();
            } else {
                break;
            }
        }
        this.onFinished();
    }

    public getRtp(): number {
        return this.rtp;
    }

    public getTotalBetAmount(): number {
        return this.totalBet;
    }

    public getTotalReturn(): number {
        return this.totalReturn;
    }

    public getCurrentGameNumber(): number {
        return this.currentGameNumber;
    }

    public getTotalGamesToPlayNumber(): number {
        return this.numberOfRounds;
    }

    public setBeforePlayCallback(callback: () => void): void {
        this.beforePlayCallback = callback;
    }

    public removeBeforePlayCallback(): void {
        this.beforePlayCallback = undefined;
    }

    public setAfterPlayCallback(callback: () => void): void {
        this.afterPlayCallback = callback;
    }

    public removeAfterPlayCallback(): void {
        this.afterPlayCallback = undefined;
    }

    public setOnFinishedCallback(callback: () => void): void {
        this.onFinishedCallback = callback;
    }

    public removeOnFinishedCallback(): void {
        this.onFinishedCallback = undefined;
    }

    private onFinished(): void {
        if (this.onFinishedCallback) {
            this.onFinishedCallback();
        }
    }

    private canPlayNextGame(): boolean {
        let r: boolean = this.session.canPlayNextGame();
        if (r && this.playStrategy) {
            r = this.playStrategy.canPlayNextSimulationRound(this.session);
        }
        return r;
    }

    private setBetBeforePlay(): void {
        if (this.changeBetStrategy) {
            this.changeBetStrategy.setBetForNextRound(this.session);
        }
    }

    private doPlay(): void {
        if (this.beforePlayCallback) {
            this.beforePlayCallback();
        }
        this.currentGameNumber++;
        this.setBetBeforePlay();
        this.totalBet += this.session.getBet();
        this.session.play();
        this.totalReturn += this.session.getWinAmount();
        this.calculateRtp();
        if (this.afterPlayCallback) {
            this.afterPlayCallback();
        }
    }

    private calculateRtp(): void {
        this.rtp = this.totalReturn / this.totalBet;
    }
}
