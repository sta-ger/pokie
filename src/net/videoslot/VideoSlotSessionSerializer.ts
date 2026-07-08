import {
    GameSessionSerializer,
    GameSessionSerializing,
    VideoSlotInitialNetworkData,
    VideoSlotRoundNetworkData,
    VideoSlotSessionHandling,
    VideoSlotSessionSerializing,
    WinningClusterDescribing,
    WinningClusterNetworkData,
    WinningScatterDescribing,
    WinningScatterNetworkData,
    WinningValueDescribing,
    WinningValueNetworkData,
    WinningWayDescribing,
    WinningWayNetworkData,
} from "pokie";

export class VideoSlotSessionSerializer<T extends string | number | symbol = string>
implements VideoSlotSessionSerializing<T> {
    private readonly baseSerializer: GameSessionSerializing;

    constructor(baseSerializer: GameSessionSerializing = new GameSessionSerializer()) {
        this.baseSerializer = baseSerializer;
    }

    public getInitialData(session: VideoSlotSessionHandling<T>): VideoSlotInitialNetworkData<T> {
        const availableSymbols = session.getAvailableSymbols();
        const reelsNumber = session.getReelsNumber();
        const reelsSymbolsNumber = session.getReelsSymbolsNumber();
        const paytable = session.getPaytable().toMap();
        const linesDefinitions: Record<string, number[]> = {};
        session
            .getLinesDefinitions()
            .getLinesIds()
            .forEach((lineId) => {
                linesDefinitions[lineId] = session.getLinesDefinitions().getLineDefinition(lineId);
            });
        return {
            ...this.baseSerializer.getInitialData(session),
            ...this.getRoundData(session),
            availableSymbols,
            reelsNumber,
            reelsSymbolsNumber,
            paytable,
            linesDefinitions,
        };
    }

    public getRoundData(session: VideoSlotSessionHandling<T>): VideoSlotRoundNetworkData<T> {
        const symbolsCombination = session.getSymbolsCombination();
        const winningLines = session.getWinningLines();
        const winningScatters = session.getWinningScatters();
        const r: VideoSlotRoundNetworkData<T> = {
            ...this.baseSerializer.getRoundData(session),
            reelsSymbols: symbolsCombination.toMatrix(),
        };
        if (Object.keys(winningLines).length > 0) {
            r.winningLines = Object.values(winningLines).reduce((acc, line) => {
                return {
                    ...acc,
                    [line.getLineId()]: {
                        definition: line.getDefinition(),
                        pattern: line.getPattern(),
                        symbolId: line.getSymbolId(),
                        lineId: line.getLineId(),
                        symbolsPositions: line.getSymbolsPositions(),
                        wildSymbolsPositions: line.getWildSymbolsPositions(),
                        winAmount: line.getWinAmount(),
                    },
                };
            }, {});
        }
        if (Object.keys(winningScatters).length > 0) {
            // Object.values() on a Record keyed by a generic type parameter loses its value type,
            // so it's cast back to a string-keyed view (safe: JS object keys are always
            // strings/symbols at runtime regardless of T).
            const scattersByKey = winningScatters as unknown as Record<string, WinningScatterDescribing<T>>;
            r.winningScatters = Object.values(scattersByKey).reduce(
                (acc, scatter) => ({
                    ...acc,
                    [scatter.getSymbolId()]: {
                        symbolId: scatter.getSymbolId(),
                        symbolsPositions: scatter.getSymbolsPositions(),
                        winAmount: scatter.getWinAmount(),
                    },
                }),
                {} as Record<T, WinningScatterNetworkData<T>>,
            );
        }
        // getWinningClusters is optional on VideoSlotSessionHandling (cluster-pay is an opt-in
        // extension, see VideoSlotWinDetermining), so existing sessions that never implement it
        // still serialize unchanged.
        const winningClusters = session.getWinningClusters?.() ?? {};
        if (Object.keys(winningClusters).length > 0) {
            r.winningClusters = Object.entries(winningClusters as Record<string, WinningClusterDescribing<T>>).reduce(
                (acc, [clusterId, cluster]) => ({
                    ...acc,
                    [clusterId]: {
                        symbolId: cluster.getSymbolId(),
                        symbolsPositions: cluster.getSymbolsPositions(),
                        winAmount: cluster.getWinAmount(),
                    },
                }),
                {} as Record<string, WinningClusterNetworkData<T>>,
            );
        }
        // getWinningValues is optional on VideoSlotSessionHandling for the same reason as
        // getWinningClusters — value-pay is an opt-in extension (see VideoSlotWinDetermining).
        const winningValues = session.getWinningValues?.() ?? {};
        if (Object.keys(winningValues).length > 0) {
            const valuesByKey = winningValues as unknown as Record<string, WinningValueDescribing<T>>;
            r.winningValues = Object.values(valuesByKey).reduce(
                (acc, value) => ({
                    ...acc,
                    [value.getSymbolId()]: {
                        symbolId: value.getSymbolId(),
                        symbolsPositions: value.getSymbolsPositions(),
                        winAmount: value.getWinAmount(),
                    },
                }),
                {} as Record<T, WinningValueNetworkData<T>>,
            );
        }
        // getWinningWays is optional on VideoSlotSessionHandling for the same reason as
        // getWinningClusters/getWinningValues — ways-pay is an opt-in extension (see
        // VideoSlotWinDetermining).
        const winningWays = session.getWinningWays?.() ?? {};
        if (Object.keys(winningWays).length > 0) {
            const waysByKey = winningWays as unknown as Record<string, WinningWayDescribing<T>>;
            r.winningWays = Object.values(waysByKey).reduce(
                (acc, way) => ({
                    ...acc,
                    [way.getSymbolId()]: {
                        symbolId: way.getSymbolId(),
                        symbolsPositions: way.getSymbolsPositions(),
                        waysCount: way.getWaysCount(),
                        winAmount: way.getWinAmount(),
                    },
                }),
                {} as Record<T, WinningWayNetworkData<T>>,
            );
        }
        return r;
    }
}
