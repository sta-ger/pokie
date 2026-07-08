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
    totalWin?: number;
    winningPositions?: number[][];
    winningLines?: Record<string, WinningLineNetworkData<T>>;
    winningScatters?: Record<T, WinningScatterNetworkData<T>>;
    winningClusters?: Record<string, WinningClusterNetworkData<T>>;
    winningValues?: Record<T, WinningValueNetworkData<T>>;
    winningWays?: Record<T, WinningWayNetworkData<T>>;
    winEvaluationResult?: WinEvaluationResultNetworkData<T>;
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

export type WinningClusterNetworkData<T extends string | number | symbol = string> = {
    symbolId: T;
    symbolsPositions: number[][];
    winAmount: number;
};

export type WinningValueNetworkData<T extends string | number | symbol = string> = {
    symbolId: T;
    symbolsPositions: number[][];
    winAmount: number;
};

export type WinningWayNetworkData<T extends string | number | symbol = string> = {
    symbolId: T;
    symbolsPositions: number[][];
    waysCount: number;
    winAmount: number;
};

export type WinEvaluationResultNetworkData<T extends string | number | symbol = string> = {
    totalWin: number;
    winningPositions: number[][];
    lineWins: WinningLineNetworkData<T>[];
    scatterWins: WinningScatterNetworkData<T>[];
    clusterWins: WinningClusterNetworkData<T>[];
    valueWins: WinningValueNetworkData<T>[];
    waysWins: WinningWayNetworkData<T>[];
    metadata: Record<string, unknown>;
};
