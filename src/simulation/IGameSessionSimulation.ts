export interface IGameSessionSimulation {

    beforePlayCallback?: () => void;

    afterPlayCallback?: () => void;

    onFinishedCallback?: () => void;

    run(): void;

    getRtp(): number;

    getTotalBetAmount(): number;

    getTotalReturn(): number;

    getCurrentGameNumber(): number;

    getTotalGameToPlayNumber(): number;

}
