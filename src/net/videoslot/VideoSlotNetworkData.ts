import {GameInitialNetworkData, GameRoundNetworkData} from "pokie";

export type VideoSlotInitialNetworkData<T extends string | number | symbol = string> = {
    availableSymbols: T[];
    reelsNumber: number;
    reelsSymbolsNumber: number;
    paytable: Record<number, Record<T, Record<number, number>>>;
    linesDefinitions: Record<string, number[]>;
} & GameInitialNetworkData &
    VideoSlotRoundNetworkData<T>;

export type VideoSlotRoundNetworkData<T extends string | number | symbol = string> = {
    reelsSymbols: T[][];
    winningLines?: Record<string, WinningLineNetworkData<T>>;
    winningScatters?: Record<T, WinningScatterNetworkData<T>>;
} & GameRoundNetworkData;

export type WinningLineNetworkData<T extends string | number | symbol = string> = {
    definition: number[];
    pattern: number[];
    symbolId: T;
    lineId: string;
    symbolsPositions: number[];
    wildSymbolsPositions: number[];
    winAmount: number;
};

export type WinningScatterNetworkData<T extends string | number | symbol = string> = {
    symbolId: T;
    symbolsPositions: number[][];
    winAmount: number;
};
