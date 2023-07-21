export interface SimulationHandling {
    run(): void;

    getRtp(): number;

    getTotalBetAmount(): number;

    getTotalReturn(): number;

    getCurrentGameNumber(): number;

    getTotalGamesToPlayNumber(): number;

    setBeforePlayCallback(callback: () => void): void;

    removeBeforePlayCallback(): void;

    setAfterPlayCallback(callback: () => void): void;

    removeAfterPlayCallback(): void;

    setOnFinishedCallback(callback: () => void): void;

    removeOnFinishedCallback(): void;
}
