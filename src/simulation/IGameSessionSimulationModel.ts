export interface IGameSessionSimulationModel {

    updateTotalBetBeforePlay(): void;

    updateTotalReturnAfterPlay(): void;

    getTotalBetAmount(): number;

    getTotalReturnAmount(): number;

    getRtp(): number;

}

