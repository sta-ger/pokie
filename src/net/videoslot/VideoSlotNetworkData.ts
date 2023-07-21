import {GameInitialNetworkData, GameRoundNetworkData} from "pokie";

export type VideoSlotInitialNetworkData = {
    availableSymbols: string[];
    reelsNumber: number;
    reelsSymbolsNumber: number;
    paytable: Record<number, Record<string, Record<number, number>>>;
    linesDefinitions: Record<string, number[]>;
} & GameInitialNetworkData &
    VideoSlotRoundNetworkData;

export type VideoSlotRoundNetworkData = {
    reelsSymbols: string[][];
    winningLines?: Record<string, WinningLineNetworkData>;
    winningScatters?: Record<string, WinningScatterNetworkData>;
} & GameRoundNetworkData;

export type WinningLineNetworkData = {
    definition: number[];
    pattern: number[];
    symbolId: string;
    lineId: string;
    symbolsPositions: number[];
    wildSymbolsPositions: number[];
    winAmount: number;
};

export type WinningScatterNetworkData = {
    symbolId: string;
    symbolsPositions: number[][];
    winAmount: number;
};
