import {
    AsyncSimulationHandling,
    BetForNextSimulationRoundSetting,
    GameSessionHandling,
    NextSessionRoundPlayableDetermining,
    SimulationConfigRepresenting,
} from "pokie";

export class Simulation implements AsyncSimulationHandling {
    private readonly session: GameSessionHandling;
    private readonly numberOfRounds: number;
    private readonly changeBetStrategy: BetForNextSimulationRoundSetting | undefined;
    private readonly playStrategy: NextSessionRoundPlayableDetermining | undefined;

    private totalBetAmount = 0;
    private totalPayoutAmount = 0;
    private numberOfWiningRounds = 0;
    private readonly rtpPerRound: number[] = [];
    private readonly allPayouts: number[] = [];
    private readonly nonZeroPayouts: number[] = [];
    private readonly betsPerRound: number[] = [];

    private currentRoundNumber = 0;

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

    public runAsync(chunkSize = 1000, delayBetweenChunks = 0): Promise<void> {
        return new Promise((resolve) => {
            let currentRound = 0;

            const playChunk = (): void => {
                const chunkEnd = Math.min(currentRound + chunkSize, this.numberOfRounds);

                for (let i = currentRound; i < chunkEnd; i++) {
                    if (this.canPlayNextGame()) {
                        this.doPlay();
                    } else {
                        this.onFinished();
                        resolve();
                        return;
                    }
                }

                currentRound = chunkEnd;

                if (currentRound < this.numberOfRounds) {
                    setTimeout(playChunk, delayBetweenChunks);
                } else {
                    this.onFinished();
                    resolve();
                }
            };

            playChunk();
        });
    }

    public getLastRtp(): number {
        return this.rtpPerRound[this.rtpPerRound.length - 1];
    }

    public getAverageRtp(): number {
        return this.rtpPerRound.reduce((sum, rtp) => sum + rtp, 0) / this.currentRoundNumber;
    }

    public getHitFrequency(): number {
        return this.numberOfWiningRounds / this.currentRoundNumber;
    }

    public getPayoutsStandardDeviation(includeZeroPayouts = true): number {
        const payouts = includeZeroPayouts ? this.allPayouts : this.nonZeroPayouts;
        const averagePayout = this.getAveragePayout(includeZeroPayouts);
        const squaredDifferences = payouts.map((payout) => (payout - averagePayout) ** 2);
        const variance = squaredDifferences.reduce((acc, val) => acc + val, 0) / payouts.length;
        return Math.sqrt(variance);
    }

    public getTotalBetAmount(): number {
        return this.totalBetAmount;
    }

    public getTotalPayoutAmount(): number {
        return this.totalPayoutAmount;
    }

    public getCurrentRoundNumber(): number {
        return this.currentRoundNumber;
    }

    public getNumberOfWinningRounds(): number {
        return this.numberOfWiningRounds;
    }

    public getTotalNumberOfRounds(): number {
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

    public getAllBets(): number[] {
        return this.betsPerRound;
    }

    public getPayouts(includeZeroPayouts = true): number[] {
        return includeZeroPayouts ? this.allPayouts : this.nonZeroPayouts;
    }

    public getAllRtpValues(): number[] {
        return this.rtpPerRound;
    }

    public getAveragePayout(includeZeroPayouts = true): number {
        return this.totalPayoutAmount / (includeZeroPayouts ? this.currentRoundNumber : this.numberOfWiningRounds);
    }

    public getAverageBet(): number {
        return this.totalBetAmount / this.currentRoundNumber;
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
        this.currentRoundNumber++;
        this.setBetBeforePlay();
        this.totalBetAmount += this.session.getBet();
        this.betsPerRound.push(this.session.getBet());
        this.session.play();
        this.totalPayoutAmount += this.session.getWinAmount();
        this.allPayouts.push(this.session.getWinAmount());
        if (this.session.getWinAmount()) {
            this.numberOfWiningRounds++;
            this.nonZeroPayouts.push(this.session.getWinAmount());
        }
        this.rtpPerRound.push(this.totalPayoutAmount / this.totalBetAmount);
        if (this.afterPlayCallback) {
            this.afterPlayCallback();
        }
    }
}
