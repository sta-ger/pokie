export interface SimulationHandling {
    run(): void;

    getLastRtp(): number;

    getAverageRtp(): number;

    getAllRtpValues(): number[];

    getHitFrequency(): number;

    getPayoutsStandardDeviation(includeZeroPayouts?: boolean): number;

    getTotalBetAmount(): number;

    getTotalPayoutAmount(): number;

    getCurrentRoundNumber(): number;

    getAllBets(): number[];

    getAverageBet(): number;

    getPayouts(includeZeroPayouts?: boolean): number[];

    getAveragePayout(includeZeroPayouts?: boolean): number;

    getNumberOfWinningRounds(): number;

    getTotalNumberOfRounds(): number;

    setBeforePlayCallback(callback: () => void): void;

    removeBeforePlayCallback(): void;

    setAfterPlayCallback(callback: () => void): void;

    removeAfterPlayCallback(): void;

    setOnFinishedCallback(callback: () => void): void;

    removeOnFinishedCallback(): void;
}
