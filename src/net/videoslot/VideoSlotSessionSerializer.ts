import {
    GameSessionSerializer,
    GameSessionSerializing,
    VideoSlotInitialNetworkData,
    VideoSlotRoundNetworkData,
    VideoSlotSessionHandling,
    VideoSlotSessionSerializing,
} from "pokie";

export class VideoSlotSessionSerializer implements VideoSlotSessionSerializing {
    private readonly baseSerializer: GameSessionSerializing;

    constructor(baseSerializer: GameSessionSerializing = new GameSessionSerializer()) {
        this.baseSerializer = baseSerializer;
    }

    public getInitialData(session: VideoSlotSessionHandling): VideoSlotInitialNetworkData {
        const availableSymbols = session.getAvailableSymbols();
        const reelsNumber = session.getReelsNumber();
        const reelsSymbolsNumber = session.getReelsSymbolsNumber();
        const paytable = session.getPaytable().toMap();
        const linesDefinitions = {};
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

    public getRoundData(session: VideoSlotSessionHandling): VideoSlotRoundNetworkData {
        const symbolsCombination = session.getSymbolsCombination();
        const winningLines = session.getWinningLines();
        const winningScatters = session.getWinningScatters();
        const r: VideoSlotRoundNetworkData = {
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
            r.winningScatters = Object.values(winningScatters).reduce((acc, scatter) => {
                return {
                    ...acc,
                    [scatter.getSymbolId()]: {
                        symbolId: scatter.getSymbolId(),
                        symbolsPositions: scatter.getSymbolsPositions(),
                        winAmount: scatter.getWinAmount(),
                    },
                };
            }, {});
        }
        return r;
    }
}
