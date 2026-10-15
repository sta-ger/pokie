import {SimulationAccumulator} from "./SimulationAccumulator.js";
import {SessionFeatureAnalyticsObserver} from "./SessionFeatureAnalyticsObserver.js";
import type {WeightedBonusStatistics, WeightedBonusProviding} from "../session/videoslot/authored/WeightedBonus.js";
import {mergeWeightedBonusStatistics} from "./WeightedBonusStatisticsMerging.js";
import {mergeReelSequenceStatistics} from "./ReelSequenceStatisticsMerging.js";
import type {ReelSequenceStatistics} from "../session/videoslot/combinations/WeightedSequenceVariant.js";
import type {VideoSlotSessionHandling} from "../session/videoslot/VideoSlotSessionHandling.js";
import {observeLogicalSubround, emptyLogicalRoundStatistics, mergeLogicalRoundStatistics, type LogicalRoundStatistics} from "./LogicalRoundStatistics.js";
import {SessionRuntime, executeSessionCommand} from "../runtime/SessionRuntime.js";
import type {AsyncSimulationHandling} from "./AsyncSimulationHandling.js";
import type {BetForNextSimulationRoundSetting} from "./BetForNextSimulationRoundSetting.js";
import type {GameSessionHandling} from "../session/GameSessionHandling.js";
import type {NextSessionRoundPlayableDetermining} from "./playstrategy/NextSessionRoundPlayableDetermining.js";
import type {SimulationConfigRepresenting} from "./SimulationConfigRepresenting.js";

export class Simulation implements AsyncSimulationHandling {
    private readonly analytics = new SimulationAccumulator();
    private readonly observer: SessionFeatureAnalyticsObserver;
    private readonly logicalSampling: boolean;
    private readonly bonusBefore?: WeightedBonusStatistics;
    private readonly sequenceBefore?: ReelSequenceStatistics[];
    private logicalRounds = emptyLogicalRoundStatistics();
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
        this.logicalSampling = SessionRuntime.supportsLogicalRoundDelivery(session);
        this.observer = new SessionFeatureAnalyticsObserver(session);
        this.analytics.configureAnalytics(this.observer.getEnvelope());
        this.bonusBefore = (session as Partial<WeightedBonusProviding>).getWeightedBonusStatistics?.();
        this.sequenceBefore = (session as Partial<VideoSlotSessionHandling>).getSequenceStatistics?.();
        this.numberOfRounds = config.getNumberOfRounds();
        this.changeBetStrategy = config.getChangeBetStrategy();
        this.playStrategy = config.getPlayStrategy();
    }

    public getWeightedBonusStatistics(): WeightedBonusStatistics | undefined {
        return mergeWeightedBonusStatistics((this.session as Partial<WeightedBonusProviding>).getWeightedBonusStatistics?.(), this.bonusBefore, true);
    }

    public getReelSequenceStatistics(): ReelSequenceStatistics[] {
        return mergeReelSequenceStatistics((this.session as Partial<VideoSlotSessionHandling>).getSequenceStatistics?.(), this.sequenceBefore, true);
    }


    public getFeatureAnalytics() {
        return this.analytics.getStatistics().analytics;
    }

    public getLogicalRoundStatistics(): LogicalRoundStatistics {
        return {...this.logicalRounds};
    }

    public run(): void {
        let i: number;
        for (i = 0; i < this.numberOfRounds; i++) {
            if (this.canPlayNextGame()) {
                this.doPlay();
            } else {
                break;
            }
        }
        this.onFinished();
    }

    public runAsync(chunkSize = 1000, delayBetweenChunks = 0): Promise<void> {
        if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
            return Promise.reject(new RangeError("chunkSize must be a positive safe integer."));
        }
        if (!Number.isFinite(delayBetweenChunks) || delayBetweenChunks < 0) {
            return Promise.reject(new RangeError("delayBetweenChunks must be a finite non-negative number."));
        }
        return new Promise((resolve, reject) => {
            let currentRound = 0;

            const playChunk = (): void => {
                try {
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
                } catch (error) {
                    reject(error);
                }
            };

            playChunk();
        });
    }

    public getLastRtp(): number {
        return this.rtpPerRound[this.rtpPerRound.length - 1] ?? 0;
    }

    public getAverageRtp(): number {
        return this.rtpPerRound.reduce((sum, rtp) => sum + rtp, 0) / (this.currentRoundNumber || 1);
    }

    public getHitFrequency(): number {
        return this.numberOfWiningRounds / (this.logicalSampling ? this.allPayouts.length || 1 : this.currentRoundNumber || 1);
    }

    public getPayoutsStandardDeviation(includeZeroPayouts = true): number {
        const payouts = includeZeroPayouts ? this.allPayouts : this.nonZeroPayouts;
        if (payouts.length === 0) return 0;
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
        if (!this.logicalSampling) return this.totalPayoutAmount / ((includeZeroPayouts ? this.currentRoundNumber : this.numberOfWiningRounds) || 1);
        return this.allPayouts.reduce((sum, value) => sum + value, 0) / ((includeZeroPayouts ? this.allPayouts.length : this.numberOfWiningRounds) || 1);
    }

    public getAverageBet(): number {
        return this.logicalSampling ? this.betsPerRound.reduce((sum, value) => sum + value, 0) / (this.betsPerRound.length || 1) : this.totalBetAmount / (this.currentRoundNumber || 1);
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
        this.setBetBeforePlay();
        const before = this.observer.beforePlay();
        const result = executeSessionCommand(this.session);
        this.analytics.addRound(result.stake, result.win, this.observer.afterPlay(before, result.win, result.mode));
        const observation = observeLogicalSubround(this.session, result.stake, result.win, !before.pending);
        if (observation) this.logicalRounds = mergeLogicalRoundStatistics(this.logicalRounds, observation);
        this.currentRoundNumber++;
        this.totalBetAmount += result.stake;
        this.totalPayoutAmount += result.win;
        const sample = this.logicalSampling ? observation && {stake: observation.totalStake, win: observation.totalWin} : result;
        if (sample) {
            this.betsPerRound.push(sample.stake);
            this.allPayouts.push(sample.win);
            if (sample.win) {
                this.numberOfWiningRounds++;
                this.nonZeroPayouts.push(sample.win);
            }
        }
        this.rtpPerRound.push(this.totalBetAmount > 0 ? this.totalPayoutAmount / this.totalBetAmount : 0);
        if (this.afterPlayCallback) {
            this.afterPlayCallback();
        }
    }

}
