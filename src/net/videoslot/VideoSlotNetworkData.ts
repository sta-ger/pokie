import type {GameInitialNetworkData, GameRoundNetworkData} from "../GameNetworkData.js";

export type VideoSlotInitialNetworkData<T extends string | number | symbol = string> = {
    availableSymbols: T[];
    reelsNumber: number;
    reelsSymbolsNumber: number;
    paytable: Record<number, Record<T, Record<number, number>>>;
    linesDefinitions: Record<string, number[]>;
    // Only present for a session decorated with bet-mode selection (see
    // VideoSlotWithBetModesSession/supportsBetModeSelecting) -- absent entirely, same as
    // winningLines/winningClusters/etc., for a session that never opted into that capability, rather
    // than a single-entry ["base"] a caller would otherwise have to know to ignore.
    availableBetModeIds?: string[];
} & GameInitialNetworkData &
    VideoSlotRoundNetworkData<T>;

export type VideoSlotRoundNetworkData<T extends string | number | symbol = string> = {
    featureChains?: import("../../session/videoslot/authored/FeatureChains.js").FeatureChainObservation;
    modifiers?: import("../../session/videoslot/modifiers/ScreenModifiers.js").ScreenModifierObservation<T>;
    holdAndWin?: ReturnType<typeof import("./observeVideoSlotFeatures.js").observeVideoSlotFeatures<T>>["holdAndWin"];
    jackpot?: ReturnType<typeof import("./observeVideoSlotFeatures.js").observeVideoSlotFeatures<T>>["jackpot"];
    chargedBetModeId?: string;
    reelsSymbols: T[][];
    /** Coverage of each visible cell row, independent of evaluation eligibility. */
    visibleRowCoverage?: number[];
    // A round replaces the player view in browser consumers. Keep the session's real bet choices
    // with it so a win/feature re-render cannot silently discard selectable bet controls.
    availableBets?: number[];
    totalWin?: number;
    winningPositions?: number[][];
    winningLines?: Record<string, WinningLineNetworkData<T>>;
    winningScatters?: Record<T, WinningScatterNetworkData<T>>;
    winningClusters?: Record<string, WinningClusterNetworkData<T>>;
    winningValues?: Record<T, WinningValueNetworkData<T>>;
    winningWays?: Record<T, WinningWayNetworkData<T>>;
    winEvaluationResult?: WinEvaluationResultNetworkData<T>;
    // The session's currently-selected bet mode id -- see availableBetModeIds above for the same
    // opt-in-capability rationale. Can change round to round (a caller's setBetMode(), or a one-shot
    // forcing mode reverting to default the instant its purchase succeeds -- see
    // VideoSlotWithBetModesSession.play()), unlike availableBetModeIds itself.
    betModeId?: string;
} & GameRoundNetworkData;

export type WinningLineNetworkData<T extends string | number | symbol = string> = {
    definition: number[];
    /** Present with overscan: visible grid positions; legacy reel-index arrays remain unchanged. */
    visiblePositions?: number[][];
    visibleWildPositions?: number[][];
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
    /** Authoritative sum of every component, including custom types not covered by the typed arrays below. */
    totalWin: number;
    winningPositions: number[][];
    lineWins: WinningLineNetworkData<T>[];
    scatterWins: WinningScatterNetworkData<T>[];
    clusterWins: WinningClusterNetworkData<T>[];
    valueWins: WinningValueNetworkData<T>[];
    waysWins: WinningWayNetworkData<T>[];
    /**
     * Complete generic projection of the evaluation's own win components, in evaluation order. The typed
     * line/scatter/cluster/value/ways arrays above stay as compatibility views; this list is the one that
     * can also describe a custom `WinComponent` subclass and therefore always reconciles with `totalWin`.
     */
    winComponents: WinComponentNetworkData<T>[];
    metadata: Record<string, unknown>;
};

/** Plain-data mirror of `WinComponent`, including custom component types. */
export type WinComponentNetworkData<T extends string | number | symbol = string> = {
    type: string;
    id: string;
    /** null when the component is not tied to one symbol (for example a round-level bonus). */
    symbolId: T | null;
    winAmount: number;
    winningPositions: number[][];
    multiplierBreakdown: {
        source: string;
        positions: number[][];
        values: number[];
        combinedMultiplier: number;
    }[];
    metadata: Record<string, unknown>;
};
