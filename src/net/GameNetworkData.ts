export type GameInitialNetworkData = {
    availableBets: number[];
} & GameRoundNetworkData;

export type GameRoundNetworkData = {
    credits: number;
    bet: number;
};
